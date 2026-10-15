import Foundation

/// eWeLink (Sonoff) bulut API v2 istemcisi.
/// Belgeler: https://coolkit-technologies.github.io/eWeLink-API/
actor EWeLinkProvider: SmartHomeProvider {
    nonisolated var kind: ProviderKind { .ewelink }

    private var config: EWeLinkConfig

    init(config: EWeLinkConfig) {
        self.config = config
    }

    // MARK: - OAuth giriş

    static func baseURL(region: String) -> String {
        region == "cn" ? "https://cn-apia.coolkit.cn" : "https://\(region)-apia.coolkit.cc"
    }

    /// eWeLink'in kendi giriş sayfası; kullanıcı e-posta/şifresini orada girer.
    static func authorizationURL(config: EWeLinkConfig, state: String) -> URL? {
        let seq = Signer.millis
        let signature = Signer.hmacSHA256("\(config.appId)_\(seq)", key: config.appSecret).base64EncodedString()
        let query = HTTP.query([
            ("state", state),
            ("clientId", config.appId),
            ("authorization", signature),
            ("seq", seq),
            ("redirectUrl", config.redirectURL),
            ("nonce", Signer.nonce()),
            ("grantType", "authorization_code"),
            ("showQRCode", "false"),
        ])
        return URL(string: "https://c2ccdn.coolkit.cc/oauth/index.html?\(query)")
    }

    /// Giriş sayfasından dönen kodu erişim anahtarına çevirir.
    static func exchangeCode(_ code: String, region: String, config: EWeLinkConfig) async throws -> EWeLinkConfig {
        let body: [String: Any] = [
            "code": code,
            "redirectUrl": config.redirectURL,
            "grantType": "authorization_code",
        ]
        let data = try await signedPost(path: "/v2/user/oauth/token", region: region, body: body, config: config)
        guard let accessToken = data["accessToken"] as? String else { throw ProviderError.invalidResponse }
        var updated = config
        updated.region = region
        updated.accessToken = accessToken
        updated.refreshToken = data["refreshToken"] as? String
        return updated
    }

    private static func signedPost(path: String, region: String, body: [String: Any], config: EWeLinkConfig) async throws -> [String: Any] {
        let bodyData = try JSONSerialization.data(withJSONObject: body)
        let signature = Signer.hmacSHA256(bodyData, key: config.appSecret).base64EncodedString()
        var request = URLRequest(url: URL(string: baseURL(region: region) + path)!)
        request.httpMethod = "POST"
        request.httpBody = bodyData
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(config.appId, forHTTPHeaderField: "X-CK-Appid")
        request.setValue(Signer.nonce(), forHTTPHeaderField: "X-CK-Nonce")
        request.setValue("Sign \(signature)", forHTTPHeaderField: "Authorization")
        return try await decode(HTTP.send(request))
    }

    private static func decode(_ response: (Data, Int)) throws -> [String: Any] {
        let (data, status) = response
        guard (200..<300).contains(status) else {
            throw ProviderError.http(status, String(decoding: data, as: UTF8.self))
        }
        let json = try HTTP.object(data)
        let error = (json["error"] as? Int) ?? 0
        switch error {
        case 0:
            return (json["data"] as? [String: Any]) ?? [:]
        case 401, 402:
            throw ProviderError.tokenExpired
        default:
            let message = (json["msg"] as? String) ?? ""
            throw ProviderError.api("eWeLink hatası \(error): \(message)")
        }
    }

    // MARK: - Oturumlu istekler

    private func request(_ method: String, _ path: String, query: String = "", body: [String: Any]? = nil, retry: Bool = true) async throws -> [String: Any] {
        guard let token = config.accessToken else { throw ProviderError.tokenExpired }
        var urlString = Self.baseURL(region: config.region) + path
        if !query.isEmpty { urlString += "?" + query }
        var request = URLRequest(url: URL(string: urlString)!)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(config.appId, forHTTPHeaderField: "X-CK-Appid")
        request.setValue(Signer.nonce(), forHTTPHeaderField: "X-CK-Nonce")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        if let body { request.httpBody = try JSONSerialization.data(withJSONObject: body) }
        do {
            return try Self.decode(await HTTP.send(request))
        } catch ProviderError.tokenExpired where retry {
            try await refreshToken()
            return try await self.request(method, path, query: query, body: body, retry: false)
        }
    }

    private func refreshToken() async throws {
        guard let refreshToken = config.refreshToken else { throw ProviderError.tokenExpired }
        let data = try await Self.signedPost(path: "/v2/user/refresh", region: config.region, body: ["rt": refreshToken], config: config)
        guard let at = data["at"] as? String else { throw ProviderError.tokenExpired }
        config.accessToken = at
        config.refreshToken = (data["rt"] as? String) ?? refreshToken
        ConfigStore.save(config, key: EWeLinkConfig.key)
    }

    // MARK: - SmartHomeProvider

    func fetchDevices() async throws -> [SmartDevice] {
        let data = try await request("GET", "/v2/device/thing", query: "num=0")
        let things = (data["thingList"] as? [[String: Any]]) ?? []
        return things.compactMap { thing in
            // itemType 1: kendi cihazım, 2: paylaşılan, 3: grup (gösterilmiyor)
            guard let type = thing["itemType"] as? Int, type == 1 || type == 2,
                  let item = thing["itemData"] as? [String: Any] else { return nil }
            return Self.makeDevice(item)
        }
    }

    /// uiid -> gerçek kanal sayısı (bazı cihazlar 4 kanal bildirse de daha azına sahiptir).
    private static let channelCounts: [Int: Int] = [
        2: 2, 3: 3, 4: 4, 7: 2, 8: 3, 9: 4, 29: 2, 30: 3, 31: 4,
        77: 1, 78: 1, 112: 1, 113: 2, 114: 3, 126: 2,
    ]

    private static func makeDevice(_ item: [String: Any]) -> SmartDevice? {
        guard let id = item["deviceid"] as? String else { return nil }
        let params = (item["params"] as? [String: Any]) ?? [:]
        let uiid = dig(item, "extra", "uiid") as? Int

        var device = SmartDevice(
            provider: .ewelink,
            rawId: id,
            name: (item["name"] as? String) ?? id,
            kind: .other,
            online: (item["online"] as? Bool) ?? false,
            model: dig(item, "productModel") as? String ?? (dig(item, "extra", "model") as? String)
        )

        if let state = params["switch"] as? String {
            device.channels = [SwitchChannel(id: "main", name: "Güç", isOn: state == "on")]
        } else if let switches = params["switches"] as? [[String: Any]] {
            let limit = uiid.flatMap { channelCounts[$0] } ?? switches.count
            device.channels = switches.prefix(limit).compactMap { entry in
                guard let outlet = entry["outlet"] as? Int else { return nil }
                return SwitchChannel(id: String(outlet), name: "Kanal \(outlet + 1)", isOn: (entry["switch"] as? String) == "on")
            }
        }

        for key in ["brightness", "bright"] {
            if let value = number(params[key]) {
                device.brightness = Int(value)
                device.meta["brightnessKey"] = key
                break
            }
        }
        device.temperature = number(params["currentTemperature"]) ?? number(params["temperature"])
        device.humidity = number(params["currentHumidity"]) ?? number(params["humidity"])
        device.power = number(params["power"])

        if device.brightness != nil {
            device.kind = .light
        } else if device.channels.count > 1 {
            device.kind = .wallSwitch
        } else if !device.channels.isEmpty {
            device.kind = device.power != nil ? .plug : .wallSwitch
        } else if device.temperature != nil || device.humidity != nil {
            device.kind = .sensor
        }
        return device
    }

    func setPower(_ device: SmartDevice, channelId: String, on: Bool) async throws {
        let state = on ? "on" : "off"
        let params: [String: Any]
        if channelId == "main" {
            params = ["switch": state]
        } else {
            params = ["switches": [["switch": state, "outlet": Int(channelId) ?? 0]]]
        }
        try await sendStatus(device, params: params)
    }

    func setBrightness(_ device: SmartDevice, percent: Int) async throws {
        let key = device.meta["brightnessKey"] ?? "brightness"
        let value = key == "bright" ? max(10, percent) : percent
        try await sendStatus(device, params: [key: value])
    }

    private func sendStatus(_ device: SmartDevice, params: [String: Any]) async throws {
        _ = try await request("POST", "/v2/device/thing/status", body: [
            "type": 1,
            "id": device.rawId,
            "params": params,
        ])
    }
}
