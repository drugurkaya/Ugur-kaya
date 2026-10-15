import SwiftUI

struct DeviceTile: View {
    let device: SmartDevice
    let room: String?
    let isFavorite: Bool
    let onToggle: () -> Void
    let onOpen: () -> Void

    private var iconColor: Color {
        guard device.online else { return .secondary }
        if device.kind == .sensor { return .red }
        return device.isOn ? .yellow : .secondary
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top) {
                Image(systemName: device.kind.symbol)
                    .font(.title2)
                    .foregroundStyle(iconColor)
                    .frame(width: 32, height: 32)
                Spacer()
                if device.isControllable {
                    Button(action: onToggle) {
                        Image(systemName: "power")
                            .font(.body.weight(.bold))
                            .frame(width: 36, height: 36)
                            .background(Circle().fill(device.isOn ? Color.accentColor : Color(.tertiarySystemFill)))
                            .foregroundStyle(device.isOn ? .white : .primary)
                    }
                    .buttonStyle(.plain)
                    .disabled(!device.online)
                    .accessibilityLabel(device.isOn ? "Kapat" : "Aç")
                }
            }

            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 4) {
                    Text(device.name)
                        .font(.subheadline.weight(.semibold))
                        .lineLimit(2)
                    if isFavorite {
                        Image(systemName: "star.fill").font(.caption2).foregroundStyle(.yellow)
                    }
                }
                Text(device.statusText)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }

            HStack(spacing: 4) {
                Circle().fill(device.provider.color).frame(width: 7, height: 7)
                Text(room.map { "\(device.provider.shortTitle) · \($0)" } ?? device.provider.shortTitle)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, minHeight: 140, alignment: .topLeading)
        .background(RoundedRectangle(cornerRadius: 18).fill(Color(.secondarySystemGroupedBackground)))
        .opacity(device.online ? 1 : 0.55)
        .contentShape(RoundedRectangle(cornerRadius: 18))
        .onTapGesture(perform: onOpen)
    }
}

struct DeviceDetailView: View {
    let deviceId: String

    @Environment(HomeStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var brightness: Double = 50
    @State private var roomText = ""

    var body: some View {
        NavigationStack {
            Group {
                if let device = store.device(withId: deviceId) {
                    form(for: device)
                        .navigationTitle(device.name)
                } else {
                    ContentUnavailableView("Cihaz bulunamadı", systemImage: "questionmark.circle")
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Bitti") { dismiss() }
                }
            }
        }
        .onAppear {
            if let device = store.device(withId: deviceId) {
                brightness = Double(device.brightness ?? 50)
                roomText = store.roomOverrides[device.id] ?? device.providerRoom ?? ""
            }
        }
        .onDisappear(perform: saveRoom)
    }

    private func form(for device: SmartDevice) -> some View {
        Form {
            Section {
                HStack(spacing: 14) {
                    Image(systemName: device.kind.symbol)
                        .font(.largeTitle)
                        .foregroundStyle(device.isOn ? .yellow : .secondary)
                    VStack(alignment: .leading) {
                        Text(device.statusText).font(.headline)
                        Label(device.provider.title, systemImage: device.provider.symbol)
                            .font(.caption)
                            .foregroundStyle(device.provider.color)
                    }
                }
                .padding(.vertical, 4)
            }

            if !device.channels.isEmpty {
                Section("Kontrol") {
                    ForEach(device.channels) { channel in
                        Toggle(channel.name, isOn: Binding(
                            get: { store.device(withId: deviceId)?.channels.first { $0.id == channel.id }?.isOn ?? false },
                            set: { value in Task { await store.setPower(device, channelId: channel.id, on: value) } }
                        ))
                        .disabled(!device.online)
                    }
                    if device.brightness != nil {
                        VStack(alignment: .leading) {
                            Text("Parlaklık: %\(Int(brightness))")
                            Slider(value: $brightness, in: 1...100, step: 1, onEditingChanged: { editing in
                                if !editing {
                                    Task { await store.setBrightness(device, percent: Int(brightness)) }
                                }
                            })
                        }
                        .disabled(!device.online)
                    }
                }
            }

            if device.temperature != nil || device.humidity != nil || device.power != nil {
                Section("Ölçümler") {
                    if let temperature = device.temperature {
                        LabeledContent("Sıcaklık", value: String(format: "%.1f °C", temperature))
                    }
                    if let humidity = device.humidity {
                        LabeledContent("Nem", value: "%\(Int(humidity.rounded()))")
                    }
                    if let power = device.power {
                        LabeledContent("Anlık güç", value: String(format: "%.1f W", power))
                    }
                }
            }

            Section("Oda") {
                TextField("Oda adı (ör. Salon)", text: $roomText)
                    .onSubmit(saveRoom)
                let suggestions = store.rooms.filter { $0 != HomeStore.unassignedRoom && $0 != roomText }
                if !suggestions.isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack {
                            ForEach(suggestions, id: \.self) { room in
                                Button(room) {
                                    roomText = room
                                    saveRoom()
                                }
                                .buttonStyle(.bordered)
                            }
                        }
                    }
                }
            }

            Section {
                Button {
                    store.toggleFavorite(device)
                } label: {
                    store.favorites.contains(device.id)
                        ? Label("Favorilerden çıkar", systemImage: "star.slash")
                        : Label("Favorilere ekle", systemImage: "star")
                }
            }

            Section("Bilgi") {
                LabeledContent("Platform", value: device.provider.title)
                LabeledContent("Durum", value: device.online ? "Çevrimiçi" : "Çevrimdışı")
                if let model = device.model { LabeledContent("Model", value: model) }
                LabeledContent("Cihaz kimliği") {
                    Text(device.rawId).font(.caption.monospaced()).textSelection(.enabled)
                }
            }
        }
    }

    private func saveRoom() {
        guard let device = store.device(withId: deviceId) else { return }
        let current = store.roomOverrides[device.id] ?? device.providerRoom ?? ""
        if roomText.trimmingCharacters(in: .whitespaces) != current {
            store.setRoom(roomText, for: device)
        }
    }
}
