import CryptoKit
import Foundation
import Security

enum Signer {
    static func hmacSHA256(_ message: Data, key: String) -> Data {
        let code = HMAC<SHA256>.authenticationCode(for: message, using: SymmetricKey(data: Data(key.utf8)))
        return Data(code)
    }

    static func hmacSHA256(_ message: String, key: String) -> Data {
        hmacSHA256(Data(message.utf8), key: key)
    }

    static func sha256Hex(_ data: Data) -> String {
        Data(SHA256.hash(data: data)).hexString
    }

    static func nonce(length: Int = 8) -> String {
        let chars = Array("abcdefghijklmnopqrstuvwxyz0123456789")
        return String((0..<length).map { _ in chars.randomElement()! })
    }

    static var millis: String { String(Int64(Date().timeIntervalSince1970 * 1000)) }
}

extension Data {
    var hexString: String { map { String(format: "%02x", $0) }.joined() }
}

extension String {
    /// RFC 3986 uyumlu yüzde kodlama (`+`, `/`, `=` dahil).
    var urlQueryEncoded: String {
        var allowed = CharacterSet.alphanumerics
        allowed.insert(charactersIn: "-._~")
        return addingPercentEncoding(withAllowedCharacters: allowed) ?? self
    }
}

enum HTTP {
    static func send(_ request: URLRequest) async throws -> (Data, Int) {
        var request = request
        request.timeoutInterval = 20
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw ProviderError.invalidResponse }
        return (data, http.statusCode)
    }

    static func object(_ data: Data) throws -> [String: Any] {
        guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw ProviderError.invalidResponse
        }
        return object
    }

    static func query(_ items: [(String, String)]) -> String {
        items.map { "\($0.0.urlQueryEncoded)=\($0.1.urlQueryEncoded)" }.joined(separator: "&")
    }
}

/// JSON değerlerini (sayı veya metin olarak gelebilir) sayıya çevirir.
func number(_ value: Any?) -> Double? {
    switch value {
    case let n as NSNumber: n.doubleValue
    case let s as String: Double(s)
    default: nil
    }
}

func dig(_ object: Any?, _ path: String...) -> Any? {
    var current = object
    for key in path {
        current = (current as? [String: Any])?[key]
    }
    return current
}

// MARK: - Keychain

/// API anahtarları ve oturum bilgileri Keychain'de, telefonda şifreli olarak saklanır.
enum Keychain {
    private static let service = "com.ugurkaya.AkilliEv"

    static func set(_ data: Data, for key: String) {
        delete(key)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
            kSecValueData as String: data,
        ]
        SecItemAdd(query as CFDictionary, nil)
    }

    static func get(_ key: String) -> Data? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess else { return nil }
        return result as? Data
    }

    static func delete(_ key: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
        ]
        SecItemDelete(query as CFDictionary)
    }
}

enum ConfigStore {
    static func load<T: Codable>(_ type: T.Type, key: String) -> T? {
        guard let data = Keychain.get(key) else { return nil }
        return try? JSONDecoder().decode(T.self, from: data)
    }

    static func save<T: Codable>(_ value: T?, key: String) {
        guard let value, let data = try? JSONEncoder().encode(value) else {
            Keychain.delete(key)
            return
        }
        Keychain.set(data, for: key)
    }
}

// MARK: - Platform ayarları

struct EWeLinkConfig: Codable, Equatable {
    static let key = "config.ewelink"

    var appId = ""
    var appSecret = ""
    var redirectURL = "https://127.0.0.1/ewelink-callback"
    var region = "eu"
    var accessToken: String?
    var refreshToken: String?

    var hasCredentials: Bool { !appId.isEmpty && !appSecret.isEmpty && !redirectURL.isEmpty }
    var isLoggedIn: Bool { hasCredentials && accessToken != nil }
}

enum TuyaRegion: String, Codable, CaseIterable, Identifiable {
    case centralEurope = "https://openapi.tuyaeu.com"
    case westernEurope = "https://openapi-weaz.tuyaeu.com"
    case america = "https://openapi.tuyaus.com"
    case china = "https://openapi.tuyacn.com"
    case india = "https://openapi.tuyain.com"

    var id: String { rawValue }

    var title: String {
        switch self {
        case .centralEurope: "Orta Avrupa (Türkiye)"
        case .westernEurope: "Batı Avrupa"
        case .america: "Amerika"
        case .china: "Çin"
        case .india: "Hindistan"
        }
    }
}

struct TuyaConfig: Codable, Equatable {
    static let key = "config.tuya"

    var accessId = ""
    var accessSecret = ""
    var region: TuyaRegion = .centralEurope

    var isReady: Bool { !accessId.isEmpty && !accessSecret.isEmpty }
}

enum SmartThingsAuthMode: String, Codable, CaseIterable, Identifiable {
    case token, oauth
    var id: String { rawValue }
    var title: String { self == .token ? "Kişisel token" : "OAuth" }
}

struct SmartThingsConfig: Codable, Equatable {
    static let key = "config.smartthings"

    var mode: SmartThingsAuthMode = .token
    var personalToken = ""
    var clientId = ""
    var clientSecret = ""
    var redirectURL = "https://127.0.0.1/smartthings-callback"
    var accessToken: String?
    var refreshToken: String?
    var tokenExpiry: Date?

    var hasOAuthCredentials: Bool { !clientId.isEmpty && !clientSecret.isEmpty && !redirectURL.isEmpty }

    var isReady: Bool {
        switch mode {
        case .token: !personalToken.isEmpty
        case .oauth: hasOAuthCredentials && refreshToken != nil
        }
    }
}
