import Foundation

/// Hesap bağlamadan paneli denemek için örnek cihazlar.
actor DemoProvider: SmartHomeProvider {
    nonisolated var kind: ProviderKind { .demo }

    private var devices: [SmartDevice] = [
        SmartDevice(provider: .demo, rawId: "salon-avize", name: "Salon Avize", kind: .light, online: true,
                    channels: [SwitchChannel(id: "main", name: "Işık", isOn: true)], brightness: 70, providerRoom: "Salon"),
        SmartDevice(provider: .demo, rawId: "salon-anahtar", name: "Salon 3'lü Anahtar", kind: .wallSwitch, online: true,
                    channels: [
                        SwitchChannel(id: "1", name: "Kanal 1", isOn: false),
                        SwitchChannel(id: "2", name: "Kanal 2", isOn: true),
                        SwitchChannel(id: "3", name: "Kanal 3", isOn: false),
                    ], providerRoom: "Salon"),
        SmartDevice(provider: .demo, rawId: "salon-isi", name: "Salon Sıcaklık", kind: .sensor, online: true,
                    temperature: 22.4, humidity: 48, providerRoom: "Salon"),
        SmartDevice(provider: .demo, rawId: "mutfak-priz", name: "Kettle Prizi", kind: .plug, online: true,
                    channels: [SwitchChannel(id: "main", name: "Güç", isOn: false)], power: 0, providerRoom: "Mutfak"),
        SmartDevice(provider: .demo, rawId: "yatak-lamba", name: "Abajur", kind: .light, online: true,
                    channels: [SwitchChannel(id: "main", name: "Işık", isOn: false)], brightness: 40, providerRoom: "Yatak Odası"),
        SmartDevice(provider: .demo, rawId: "bahce", name: "Bahçe Aydınlatma", kind: .wallSwitch, online: false,
                    channels: [SwitchChannel(id: "main", name: "Güç", isOn: false)], providerRoom: "Bahçe"),
    ]

    func fetchDevices() async throws -> [SmartDevice] {
        try await Task.sleep(for: .milliseconds(300))
        return devices
    }

    func setPower(_ device: SmartDevice, channelId: String, on: Bool) async throws {
        guard let index = devices.firstIndex(where: { $0.rawId == device.rawId }),
              let channel = devices[index].channels.firstIndex(where: { $0.id == channelId }) else { return }
        devices[index].channels[channel].isOn = on
        if devices[index].kind == .plug { devices[index].power = on ? 1850 : 0 }
    }

    func setBrightness(_ device: SmartDevice, percent: Int) async throws {
        guard let index = devices.firstIndex(where: { $0.rawId == device.rawId }) else { return }
        devices[index].brightness = percent
    }
}
