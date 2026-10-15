import Foundation

/// Samsung SmartThings REST API istemcisi.
/// Belgeler: https://developer.smartthings.com/docs/api/public
actor SmartThingsProvider: SmartHomeProvider {
    nonisolated var kind: ProviderKind { .smartthings }

    private static let apiBase = "https://api.smartthings.com/v1"
    private static let scopes = "r:devices:* x:devices:* r:locations:*"

    private var config: SmartThingsConfig

    init(config: SmartThingsConfig) {
        self.config = config
    }

    // MARK: - OAuth

    static func authorizationURL(config: SmartThingsConfig) -> URL? {
        let query = HTTP.query([
            ("client_id", config.clientId),
            ("response_type", "code"),
            ("redirect_uri", config.redirectURL),
            ("scope", scopes),
        ])
        return URL(string: "https://api.smartthings.com/oauth/authorize?\(query)")
    }

    static func exchangeCode(_ code: String, config: SmartThingsConfig) async throws -> SmartThingsConfig {
        try await tokenRequest([
            ("grant_type", "authorization_code"),
            ("code", code),
            ("client_id", config.clientId),
            ("redirect_uri", config.redirectURL),
        ], config: config)
    }

    private static func tokenRequest(_ form: [(String, String)], config: SmartThingsConfig) async throws -> SmartThingsConfig {
        var request = URLRequest(url: URL(string: "https://api.smartthings.com/oauth/token")!)
        request.httpMethod = "POST"
        let basic = Data("\(config.clientId):\(config.clientSecret)".utf8).base64EncodedString()
        request.setValue("Basic \(basic)", forHTTPHeaderField: "Authorization")
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        request.httpBody = Data(HTTP.query(form).utf8)
        let (data, status) = try await HTTP.send(request)
        guard (200..<300).contains(status) else {
            throw status == 400 || status == 401 ? ProviderError.tokenExpired : ProviderError.http(status, String(decoding: data, as: UTF8.self))
        }
        let json = try HTTP.object(data)
        guard let accessToken = json["access_token"] as? String else { throw ProviderError.invalidResponse }
        var updated = config
        updated.accessToken = accessToken
        updated.refreshToken = (json["refresh_token"] as? String) ?? config.refreshToken
        updated.tokenExpiry = Date().addingTimeInterval((number(json["expires_in"]) ?? 86400) - 120)
        return updated
    }

    private func bearerToken(forceRefresh: Bool = false) async throws -> String {
        switch config.mode {
        case .token:
            guard !config.personalToken.isEmpty else { throw ProviderError.notConfigured("SmartThings") }
            return config.personalToken
        case .oauth:
            if !forceRefresh, let token = config.accessToken, let expiry = config.tokenExpiry, expiry > Date() {
                return token
            }
            guard let refreshToken = config.refreshToken else { throw ProviderError.tokenExpired }
            config = try await Self.tokenRequest([
                ("grant_type", "refresh_token"),
                ("client_id", config.clientId),
                ("refresh_token", refreshToken),
            ], config: config)
            ConfigStore.save(config, key: SmartThingsConfig.key)
            return config.accessToken ?? ""
        }
    }

    // MARK: - İstekler

    private func send(_ method: String, _ url: String, body: [String: Any]? = nil, retry: Bool = true) async throws -> [String: Any] {
        let token = try await bearerToken(forceRefresh: !retry)
        var request = URLRequest(url: URL(string: url)!)
        request.httpMethod = method
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        let (data, status) = try await HTTP.send(request)
        if status == 401 {
            if retry, config.mode == .oauth {
                return try await send(method, url, body: body, retry: false)
            }
            throw config.mode == .token
                ? ProviderError.api("SmartThings token geçersiz veya süresi dolmuş. Yeni token oluşturun.")
                : ProviderError.tokenExpired
        }
        guard (200..<300).contains(status) else {
            throw ProviderError.http(status, String(decoding: data, as: UTF8.self))
        }
        return data.isEmpty ? [:] : try HTTP.object(data)
    }

    // MARK: - SmartHomeProvider

    func fetchDevices() async throws -> [SmartDevice] {
        var items: [[String: Any]] = []
        var next: String? = Self.apiBase + "/devices"
        while let url = next {
            let page = try await send("GET", url)
            items += (page["items"] as? [[String: Any]]) ?? []
            next = dig(page, "_links", "next", "href") as? String
        }

        // Oda adları
        var roomNames: [String: String] = [:]
        let locationIds = Set(items.compactMap { $0["locationId"] as? String })
        for location in locationIds {
            let rooms = (try? await send("GET", "\(Self.apiBase)/locations/\(location)/rooms"))?["items"] as? [[String: Any]] ?? []
            for room in rooms {
                if let id = room["roomId"] as? String, let name = room["name"] as? String { roomNames[id] = name }
            }
        }

        // Durum ve çevrimiçi bilgisi cihaz başına paralel alınır.
        let ids = items.compactMap { $0["deviceId"] as? String }
        var statuses: [String: [String: Any]] = [:]
        var health: [String: String] = [:]
        await withTaskGroup(of: Snapshot.self) { group in
            for id in ids {
                group.addTask { await self.snapshot(id) }
            }
            for await snapshot in group {
                statuses[snapshot.id] = snapshot.status.flatMap { try? HTTP.object($0) }
                health[snapshot.id] = snapshot.health
            }
        }

        return items.compactMap { item in
            guard let id = item["deviceId"] as? String else { return nil }
            return Self.makeDevice(
                item,
                status: (statuses[id]?["components"] as? [String: Any]) ?? [:],
                online: health[id] != "OFFLINE",
                room: (item["roomId"] as? String).flatMap { roomNames[$0] }
            )
        }
    }

    private struct Snapshot: Sendable {
        let id: String
        let status: Data?
        let health: String?
    }

    private func snapshot(_ id: String) async -> Snapshot {
        let status = try? await send("GET", "\(Self.apiBase)/devices/\(id)/status")
        let health = try? await send("GET", "\(Self.apiBase)/devices/\(id)/health")
        return Snapshot(
            id: id,
            status: status.flatMap { try? JSONSerialization.data(withJSONObject: $0) },
            health: health?["state"] as? String
        )
    }

    private static func makeDevice(_ item: [String: Any], status: [String: Any], online: Bool, room: String?) -> SmartDevice? {
        guard let id = item["deviceId"] as? String else { return nil }
        let components = (item["components"] as? [[String: Any]]) ?? []
        func capabilities(_ component: [String: Any]) -> [String] {
            ((component["capabilities"] as? [[String: Any]]) ?? []).compactMap { $0["id"] as? String }
        }
        let mainCaps = Set(components.first { ($0["id"] as? String) == "main" }.map(capabilities) ?? [])

        var device = SmartDevice(
            provider: .smartthings,
            rawId: id,
            name: (item["label"] as? String) ?? (item["name"] as? String) ?? id,
            kind: .other,
            online: online,
            providerRoom: room,
            model: item["name"] as? String
        )

        device.channels = components.compactMap { component in
            guard let componentId = component["id"] as? String, capabilities(component).contains("switch") else { return nil }
            let value = dig(status, componentId, "switch", "switch", "value") as? String
            let name = componentId == "main" ? "Güç" : ((component["label"] as? String) ?? componentId)
            return SwitchChannel(id: componentId, name: name, isOn: value == "on")
        }

        if mainCaps.contains("switchLevel"), let level = number(dig(status, "main", "switchLevel", "level", "value")) {
            device.brightness = Int(level)
        }
        device.temperature = number(dig(status, "main", "temperatureMeasurement", "temperature", "value"))
        if (dig(status, "main", "temperatureMeasurement", "temperature", "unit") as? String) == "F", let f = device.temperature {
            device.temperature = (f - 32) * 5 / 9
        }
        device.humidity = number(dig(status, "main", "relativeHumidityMeasurement", "humidity", "value"))
        device.power = number(dig(status, "main", "powerMeter", "power", "value"))

        if mainCaps.contains("switchLevel") || mainCaps.contains("colorControl") || mainCaps.contains("colorTemperature") {
            device.kind = .light
        } else if !device.channels.isEmpty {
            device.kind = device.power != nil ? .plug : .wallSwitch
        } else if device.temperature != nil || device.humidity != nil || mainCaps.contains("motionSensor") || mainCaps.contains("contactSensor") {
            device.kind = .sensor
        }
        return device
    }

    func setPower(_ device: SmartDevice, channelId: String, on: Bool) async throws {
        try await command(device, ["component": channelId, "capability": "switch", "command": on ? "on" : "off"])
    }

    func setBrightness(_ device: SmartDevice, percent: Int) async throws {
        try await command(device, ["component": "main", "capability": "switchLevel", "command": "setLevel", "arguments": [percent]])
    }

    private func command(_ device: SmartDevice, _ command: [String: Any]) async throws {
        _ = try await send("POST", "\(Self.apiBase)/devices/\(device.rawId)/commands", body: ["commands": [command]])
    }
}
