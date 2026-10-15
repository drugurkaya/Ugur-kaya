import Foundation
import SwiftUI

/// Panelin konuştuğu akıllı ev platformları.
enum ProviderKind: String, Codable, CaseIterable, Identifiable, Sendable {
    case ewelink
    case tuya
    case smartthings
    case demo

    var id: String { rawValue }

    var title: String {
        switch self {
        case .ewelink: "eWeLink (Sonoff)"
        case .tuya: "Xenon / Tuya / Smart Life"
        case .smartthings: "SmartThings"
        case .demo: "Demo"
        }
    }

    var shortTitle: String {
        switch self {
        case .ewelink: "eWeLink"
        case .tuya: "Xenon"
        case .smartthings: "SmartThings"
        case .demo: "Demo"
        }
    }

    var color: Color {
        switch self {
        case .ewelink: .blue
        case .tuya: .orange
        case .smartthings: .teal
        case .demo: .gray
        }
    }

    var symbol: String {
        switch self {
        case .ewelink: "bolt.horizontal.circle"
        case .tuya: "sun.max.circle"
        case .smartthings: "circle.hexagongrid.circle"
        case .demo: "sparkles"
        }
    }
}

enum DeviceKind: String, Codable, Sendable {
    case light, plug, wallSwitch, sensor, other

    var symbol: String {
        switch self {
        case .light: "lightbulb.fill"
        case .plug: "powerplug.fill"
        case .wallSwitch: "light.switch.on"
        case .sensor: "thermometer.medium"
        case .other: "square.grid.2x2"
        }
    }
}

/// Bir cihazdaki tek bir aç/kapa kanalı (çok gözlü anahtarlarda birden fazla olur).
struct SwitchChannel: Identifiable, Hashable, Codable, Sendable {
    var id: String
    var name: String
    var isOn: Bool
}

/// Tüm platformlardan gelen cihazların ortak gösterimi.
struct SmartDevice: Identifiable, Hashable, Sendable {
    let provider: ProviderKind
    let rawId: String
    var name: String
    var kind: DeviceKind
    var online: Bool
    var channels: [SwitchChannel] = []
    /// 0...100
    var brightness: Int?
    var temperature: Double?
    var humidity: Double?
    /// Watt
    var power: Double?
    var providerRoom: String?
    var model: String?
    /// Platforma özel bilgiler (ör. parlaklık kodu ve aralığı).
    var meta: [String: String] = [:]

    var id: String { "\(provider.rawValue):\(rawId)" }
    var isOn: Bool { channels.contains { $0.isOn } }
    var isControllable: Bool { !channels.isEmpty }

    var statusText: String {
        guard online else { return "Çevrimdışı" }
        var parts: [String] = []
        if channels.count > 1 {
            parts.append("\(channels.filter(\.isOn).count)/\(channels.count) açık")
        } else if let channel = channels.first {
            parts.append(channel.isOn ? "Açık" : "Kapalı")
        }
        if let brightness, isOn { parts.append("%\(brightness)") }
        if let temperature { parts.append(String(format: "%.1f°C", temperature)) }
        if let humidity { parts.append("Nem %\(Int(humidity.rounded()))") }
        if let power { parts.append(String(format: "%.0f W", power)) }
        return parts.isEmpty ? "Çevrimiçi" : parts.joined(separator: " · ")
    }
}

/// Kullanıcının tanımladığı sahne: birden çok cihazı tek dokunuşla aç/kapat.
struct HomeScene: Identifiable, Codable, Hashable {
    var id = UUID()
    var name: String
    var symbol: String = "sparkles"
    var actions: [SceneAction] = []
}

struct SceneAction: Codable, Hashable {
    var deviceId: String
    /// nil ise cihazın tüm kanalları.
    var channelId: String?
    var turnOn: Bool
}

enum ProviderError: LocalizedError {
    case notConfigured(String)
    case tokenExpired
    case http(Int, String)
    case api(String)
    case invalidResponse

    var errorDescription: String? {
        switch self {
        case .notConfigured(let what): "\(what) ayarları eksik."
        case .tokenExpired: "Oturum süresi doldu, Ayarlar'dan yeniden giriş yapın."
        case .http(let code, let body): "Sunucu hatası (\(code)). \(body.prefix(200))"
        case .api(let message): message
        case .invalidResponse: "Sunucudan beklenmeyen yanıt geldi."
        }
    }
}

/// Her platform istemcisinin uyguladığı ortak arayüz.
protocol SmartHomeProvider: AnyObject, Sendable {
    var kind: ProviderKind { get }
    func fetchDevices() async throws -> [SmartDevice]
    func setPower(_ device: SmartDevice, channelId: String, on: Bool) async throws
    func setBrightness(_ device: SmartDevice, percent: Int) async throws
}
