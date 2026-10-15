import Foundation

/// Tuya Cloud (IoT Platform) istemcisi. Xenon Smart, Smart Life ve Tuya Smart
/// cihazları aynı Tuya altyapısını kullanır.
/// Belgeler: https://developer.tuya.com/en/docs/iot/new-singnature
actor TuyaProvider: SmartHomeProvider {
    nonisolated var kind: ProviderKind { .tuya }

    private let config: TuyaConfig
    private var token: String?
    private var tokenExpiry = Date.distantPast

    init(config: TuyaConfig) {
        self.config = config
    }

    // MARK: - İmzalı istek

    private func call(_ method: String, _ path: String, query: [(String, String)] = [], body: [String: Any]? = nil, authorized: Bool = true, retry: Bool = true) async throws -> Any? {
        guard config.isReady else { throw ProviderError.notConfigured("Tuya") }
        if authorized { try await ensureToken() }
        let accessToken = authorized ? (token ?? "") : ""

        let sortedQuery = query.sorted { $0.0 < $1.0 }.map { "\($0.0)=\($0.1)" }.joined(separator: "&")
        let url = sortedQuery.isEmpty ? path : "\(path)?\(sortedQuery)"
        let bodyData = try body.map { try JSONSerialization.data(withJSONObject: $0) } ?? Data()
        let t = Signer.millis
        let nonce = UUID().uuidString
        let stringToSign = [method, Signer.sha256Hex(bodyData), "", url].joined(separator: "\n")
        let sign = Signer.hmacSHA256(config.accessId + accessToken + t + nonce + stringToSign, key: config.accessSecret)
            .hexString.uppercased()

        var request = URLRequest(url: URL(string: config.region.rawValue + url)!)
        request.httpMethod = method
        request.setValue(config.accessId, forHTTPHeaderField: "client_id")
        request.setValue(sign, forHTTPHeaderField: "sign")
        request.setValue(t, forHTTPHeaderField: "t")
        request.setValue(nonce, forHTTPHeaderField: "nonce")
        request.setValue("HMAC-SHA256", forHTTPHeaderField: "sign_method")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if authorized { request.setValue(accessToken, forHTTPHeaderField: "access_token") }
        if body != nil { request.httpBody = bodyData }

        let (data, status) = try await HTTP.send(request)
        guard (200..<300).contains(status) else {
            throw ProviderError.http(status, String(decoding: data, as: UTF8.self))
        }
        let json = try HTTP.object(data)
        if (json["success"] as? Bool) == true {
            return json["result"]
        }
        let code = (json["code"] as? Int) ?? -1
        if authorized, retry, code == 1010 || code == 1011 {
            token = nil
            return try await call(method, path, query: query, body: body, authorized: true, retry: false)
        }
        let message = (json["msg"] as? String) ?? ""
        throw ProviderError.api("Tuya hatası \(code): \(message)")
    }

    private func ensureToken() async throws {
        if token != nil, tokenExpiry > Date() { return }
        let result = try await call("GET", "/v1.0/token", query: [("grant_type", "1")], authorized: false) as? [String: Any]
        guard let accessToken = result?["access_token"] as? String else { throw ProviderError.invalidResponse }
        token = accessToken
        let seconds = number(result?["expire_time"]) ?? 3600
        tokenExpiry = Date().addingTimeInterval(seconds - 120)
    }

    // MARK: - SmartHomeProvider

    func fetchDevices() async throws -> [SmartDevice] {
        var devices: [SmartDevice] = []
        var lastRowKey: String?
        repeat {
            var query = [("size", "100")]
            if let lastRowKey { query.append(("last_row_key", lastRowKey)) }
            let result = try await call("GET", "/v1.0/iot-01/associated-users/devices", query: query) as? [String: Any]
            let list = (result?["devices"] as? [[String: Any]]) ?? []
            devices += list.compactMap(Self.makeDevice)
            let hasMore = (result?["has_more"] as? Bool) ?? false
            lastRowKey = hasMore ? result?["last_row_key"] as? String : nil
        } while lastRowKey != nil
        return devices
    }

    private static let lightCategories: Set = ["dj", "dd", "xdd", "fwd", "dc", "fsd", "tgq", "tgkg"]
    private static let plugCategories: Set = ["cz", "pc"]
    private static let sensorCategories: Set = ["wsdcg", "mcs", "pir", "ywbj", "sj", "rqbj", "co2bj", "hjjcy"]

    private static func makeDevice(_ raw: [String: Any]) -> SmartDevice? {
        guard let id = raw["id"] as? String else { return nil }
        var status: [String: Any] = [:]
        for entry in (raw["status"] as? [[String: Any]]) ?? [] {
            if let code = entry["code"] as? String { status[code] = entry["value"] }
        }
        let category = (raw["category"] as? String) ?? ""

        var device = SmartDevice(
            provider: .tuya,
            rawId: id,
            name: (raw["name"] as? String) ?? id,
            kind: .other,
            online: (raw["online"] as? Bool) ?? false,
            model: raw["product_name"] as? String
        )

        // Aç/kapa kanalları
        let switchCodes = status.keys.filter { code in
            code == "switch" || code == "switch_led" || code.range(of: #"^switch_\d+$"#, options: .regularExpression) != nil
        }.sorted()
        device.channels = switchCodes.compactMap { code in
            guard let isOn = status[code] as? Bool else { return nil }
            let name: String
            switch code {
            case "switch_led": name = "Işık"
            case "switch": name = "Güç"
            default: name = "Kanal " + code.replacingOccurrences(of: "switch_", with: "")
            }
            return SwitchChannel(id: code, name: name, isOn: isOn)
        }

        // Parlaklık (kod ve aralık cihaz nesline göre değişir)
        for (code, min, max) in [("bright_value_v2", 10.0, 1000.0), ("bright_value", 25.0, 255.0), ("bright_value_1", 10.0, 1000.0)] {
            if let value = number(status[code]) {
                device.brightness = Int(((value - min) / (max - min) * 100).rounded()).clamped(1, 100)
                device.meta["brightCode"] = code
                device.meta["brightMin"] = String(min)
                device.meta["brightMax"] = String(max)
                break
            }
        }

        // Sensörler: Tuya çoğunlukla değeri 10 ile çarpılmış gönderir.
        if let t = number(status["temp_current"]) ?? number(status["va_temperature"]) {
            device.temperature = abs(t) >= 100 ? t / 10 : t
        }
        if let h = number(status["humidity_value"]) ?? number(status["va_humidity"]) {
            device.humidity = h > 100 ? h / 10 : h
        }
        if let p = number(status["cur_power"]) {
            device.power = p / 10
        }

        if lightCategories.contains(category) || device.brightness != nil {
            device.kind = .light
        } else if plugCategories.contains(category) {
            device.kind = .plug
        } else if sensorCategories.contains(category) || (device.channels.isEmpty && device.temperature != nil) {
            device.kind = .sensor
        } else if !device.channels.isEmpty {
            device.kind = .wallSwitch
        }
        return device
    }

    func setPower(_ device: SmartDevice, channelId: String, on: Bool) async throws {
        try await send(device, code: channelId, value: on)
    }

    func setBrightness(_ device: SmartDevice, percent: Int) async throws {
        let code = device.meta["brightCode"] ?? "bright_value_v2"
        let min = Double(device.meta["brightMin"] ?? "") ?? 10
        let max = Double(device.meta["brightMax"] ?? "") ?? 1000
        let value = Int((min + Double(percent) / 100 * (max - min)).rounded())
        try await send(device, code: code, value: value)
    }

    private func send(_ device: SmartDevice, code: String, value: Any) async throws {
        _ = try await call("POST", "/v1.0/iot-03/devices/\(device.rawId)/commands", body: [
            "commands": [["code": code, "value": value]],
        ])
    }
}

extension Comparable {
    func clamped(_ lower: Self, _ upper: Self) -> Self { min(max(self, lower), upper) }
}
