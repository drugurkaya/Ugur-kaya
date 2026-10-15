import Foundation
import Observation

/// Tüm platformlardaki cihazları tek listede toplayan ortak panel durumu.
@Observable
@MainActor
final class HomeStore {
    static let unassignedRoom = "Odasız"

    private(set) var devices: [SmartDevice] = []
    private(set) var errors: [ProviderKind: String] = [:]
    private(set) var isLoading = false
    private(set) var lastUpdated: Date?
    private(set) var activeProviders: [ProviderKind] = []

    var favorites: Set<String> {
        didSet { defaults.set(Array(favorites), forKey: "favorites") }
    }

    var roomOverrides: [String: String] {
        didSet { defaults.set(roomOverrides, forKey: "roomOverrides") }
    }

    var scenes: [HomeScene] {
        didSet { defaults.set(try? JSONEncoder().encode(scenes), forKey: "scenes") }
    }

    var demoMode: Bool {
        didSet {
            defaults.set(demoMode, forKey: "demoMode")
            reloadProviders()
            Task { await refresh() }
        }
    }

    @ObservationIgnored private var providers: [ProviderKind: any SmartHomeProvider] = [:]
    private let defaults = UserDefaults.standard

    init() {
        let defaults = UserDefaults.standard
        favorites = Set(defaults.stringArray(forKey: "favorites") ?? [])
        roomOverrides = (defaults.dictionary(forKey: "roomOverrides") as? [String: String]) ?? [:]
        scenes = defaults.data(forKey: "scenes").flatMap { try? JSONDecoder().decode([HomeScene].self, from: $0) } ?? []
        demoMode = defaults.object(forKey: "demoMode") as? Bool ?? true
        reloadProviders()
    }

    /// Ayarlar değiştiğinde platform istemcilerini yeniden kurar.
    func reloadProviders() {
        var result: [ProviderKind: any SmartHomeProvider] = [:]
        if let config = ConfigStore.load(EWeLinkConfig.self, key: EWeLinkConfig.key), config.isLoggedIn {
            result[.ewelink] = EWeLinkProvider(config: config)
        }
        if let config = ConfigStore.load(TuyaConfig.self, key: TuyaConfig.key), config.isReady {
            result[.tuya] = TuyaProvider(config: config)
        }
        if let config = ConfigStore.load(SmartThingsConfig.self, key: SmartThingsConfig.key), config.isReady {
            result[.smartthings] = SmartThingsProvider(config: config)
        }
        if demoMode {
            result[.demo] = DemoProvider()
        }
        providers = result
        activeProviders = ProviderKind.allCases.filter { result[$0] != nil }
        devices.removeAll { result[$0.provider] == nil }
        errors = errors.filter { result[$0.key] != nil }
    }

    func refresh() async {
        guard !isLoading else { return }
        isLoading = true
        defer { isLoading = false }

        let current = providers
        let results = await withTaskGroup(of: (ProviderKind, Result<[SmartDevice], Error>).self) { group in
            for (kind, provider) in current {
                group.addTask {
                    do {
                        return (kind, .success(try await provider.fetchDevices()))
                    } catch {
                        return (kind, .failure(error))
                    }
                }
            }
            var collected: [(ProviderKind, Result<[SmartDevice], Error>)] = []
            for await item in group { collected.append(item) }
            return collected
        }

        for (kind, result) in results where providers[kind] != nil {
            switch result {
            case .success(let list):
                devices.removeAll { $0.provider == kind }
                devices.append(contentsOf: list)
                errors[kind] = nil
            case .failure(let error):
                errors[kind] = error.localizedDescription
            }
        }
        devices.sort { $0.name.localizedStandardCompare($1.name) == .orderedAscending }
        lastUpdated = Date()
    }

    // MARK: - Sorgular

    func device(withId id: String) -> SmartDevice? {
        devices.first { $0.id == id }
    }

    func room(for device: SmartDevice) -> String {
        roomOverrides[device.id] ?? device.providerRoom ?? Self.unassignedRoom
    }

    var rooms: [String] {
        Set(devices.map(room(for:))).sorted { lhs, rhs in
            if lhs == Self.unassignedRoom { return false }
            if rhs == Self.unassignedRoom { return true }
            return lhs.localizedStandardCompare(rhs) == .orderedAscending
        }
    }

    func setRoom(_ room: String, for device: SmartDevice) {
        let trimmed = room.trimmingCharacters(in: .whitespacesAndNewlines)
        roomOverrides[device.id] = trimmed.isEmpty ? nil : trimmed
    }

    func toggleFavorite(_ device: SmartDevice) {
        if favorites.contains(device.id) {
            favorites.remove(device.id)
        } else {
            favorites.insert(device.id)
        }
    }

    // MARK: - Kontrol

    /// Tek kanallı cihazı açar/kapatır; çok kanallıda hepsini birlikte.
    func toggle(_ device: SmartDevice) async {
        let target = !device.isOn
        for channel in device.channels where channel.isOn != target {
            await setPower(device, channelId: channel.id, on: target)
        }
    }

    func setPower(_ device: SmartDevice, channelId: String, on: Bool) async {
        guard let provider = providers[device.provider] else { return }
        update(device.id) { item in
            if let index = item.channels.firstIndex(where: { $0.id == channelId }) { item.channels[index].isOn = on }
        }
        do {
            try await provider.setPower(device, channelId: channelId, on: on)
        } catch {
            update(device.id) { item in
                if let index = item.channels.firstIndex(where: { $0.id == channelId }) { item.channels[index].isOn = !on }
            }
            errors[device.provider] = "\(device.name): \(error.localizedDescription)"
        }
    }

    func setBrightness(_ device: SmartDevice, percent: Int) async {
        guard let provider = providers[device.provider] else { return }
        let previous = device.brightness
        update(device.id) { $0.brightness = percent }
        do {
            try await provider.setBrightness(device, percent: percent)
        } catch {
            update(device.id) { $0.brightness = previous }
            errors[device.provider] = "\(device.name): \(error.localizedDescription)"
        }
    }

    func turnEverythingOff() async {
        for device in devices where device.online && device.isOn {
            for channel in device.channels where channel.isOn {
                await setPower(device, channelId: channel.id, on: false)
            }
        }
    }

    func run(_ scene: HomeScene) async {
        for action in scene.actions {
            guard let device = device(withId: action.deviceId), device.online else { continue }
            let channelIds = action.channelId.map { [$0] } ?? device.channels.map(\.id)
            for channelId in channelIds {
                await setPower(device, channelId: channelId, on: action.turnOn)
            }
        }
    }

    func dismissError(for kind: ProviderKind) {
        errors[kind] = nil
    }

    private func update(_ id: String, _ change: (inout SmartDevice) -> Void) {
        guard let index = devices.firstIndex(where: { $0.id == id }) else { return }
        change(&devices[index])
    }
}
