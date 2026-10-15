import SwiftUI

struct ScenesView: View {
    @Environment(HomeStore.self) private var store
    @State private var editing: HomeScene?
    @State private var running: UUID?

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Button {
                        Task { await store.turnEverythingOff() }
                    } label: {
                        Label("Her şeyi kapat", systemImage: "power")
                    }
                } footer: {
                    Text("Tüm platformlardaki açık cihazları kapatır.")
                }

                Section("Sahnelerim") {
                    if store.scenes.isEmpty {
                        Text("Henüz sahne yok. Sağ üstteki + ile örneğin \"Eve geldim\" veya \"Gece\" sahnesi oluşturun.")
                            .foregroundStyle(.secondary)
                    }
                    ForEach(store.scenes) { scene in
                        HStack {
                            Label {
                                VStack(alignment: .leading) {
                                    Text(scene.name)
                                    Text("\(scene.actions.count) cihaz").font(.caption).foregroundStyle(.secondary)
                                }
                            } icon: {
                                Image(systemName: scene.symbol).foregroundStyle(.tint)
                            }
                            Spacer()
                            if running == scene.id {
                                ProgressView()
                            } else {
                                Button("Çalıştır") { run(scene) }
                                    .buttonStyle(.borderedProminent)
                            }
                        }
                        .contentShape(Rectangle())
                        .swipeActions {
                            Button(role: .destructive) {
                                store.scenes.removeAll { $0.id == scene.id }
                            } label: {
                                Label("Sil", systemImage: "trash")
                            }
                            Button {
                                editing = scene
                            } label: {
                                Label("Düzenle", systemImage: "pencil")
                            }
                        }
                    }
                }
            }
            .navigationTitle("Sahneler")
            .toolbar {
                Button {
                    editing = HomeScene(name: "")
                } label: {
                    Image(systemName: "plus")
                }
            }
            .sheet(item: $editing) { scene in
                SceneEditorView(scene: scene) { saved in
                    if let index = store.scenes.firstIndex(where: { $0.id == saved.id }) {
                        store.scenes[index] = saved
                    } else {
                        store.scenes.append(saved)
                    }
                }
            }
        }
    }

    private func run(_ scene: HomeScene) {
        running = scene.id
        Task {
            await store.run(scene)
            running = nil
        }
    }
}

private struct SceneEditorView: View {
    enum Choice: Hashable { case skip, on, off }

    @Environment(HomeStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State var scene: HomeScene
    let onSave: (HomeScene) -> Void
    @State private var choices: [String: Choice] = [:]

    private let symbols = ["sparkles", "house.fill", "moon.fill", "sun.max.fill", "film.fill", "bed.double.fill", "figure.walk", "cup.and.saucer.fill"]

    var body: some View {
        NavigationStack {
            Form {
                Section("Sahne") {
                    TextField("Ad (ör. Gece modu)", text: $scene.name)
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack {
                            ForEach(symbols, id: \.self) { symbol in
                                Image(systemName: symbol)
                                    .frame(width: 40, height: 40)
                                    .background(Circle().fill(scene.symbol == symbol ? Color.accentColor.opacity(0.25) : Color.clear))
                                    .onTapGesture { scene.symbol = symbol }
                            }
                        }
                    }
                    Button("Şu anki durumdan doldur") {
                        for device in store.devices where device.isControllable {
                            choices[device.id] = device.isOn ? .on : .off
                        }
                    }
                }

                ForEach(store.rooms, id: \.self) { room in
                    let devices = store.devices.filter { $0.isControllable && store.room(for: $0) == room }
                    if !devices.isEmpty {
                        Section(room) {
                            ForEach(devices) { device in
                                Picker(selection: binding(for: device)) {
                                    Text("—").tag(Choice.skip)
                                    Text("Aç").tag(Choice.on)
                                    Text("Kapat").tag(Choice.off)
                                } label: {
                                    VStack(alignment: .leading) {
                                        Text(device.name)
                                        Text(device.provider.shortTitle).font(.caption).foregroundStyle(device.provider.color)
                                    }
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle(scene.name.isEmpty ? "Yeni sahne" : scene.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Vazgeç") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Kaydet") {
                        scene.actions = choices.compactMap { id, choice in
                            choice == .skip ? nil : SceneAction(deviceId: id, channelId: nil, turnOn: choice == .on)
                        }.sorted { $0.deviceId < $1.deviceId }
                        onSave(scene)
                        dismiss()
                    }
                    .disabled(scene.name.trimmingCharacters(in: .whitespaces).isEmpty || !choices.values.contains { $0 != .skip })
                }
            }
            .onAppear {
                for action in scene.actions {
                    choices[action.deviceId] = action.turnOn ? .on : .off
                }
            }
        }
    }

    private func binding(for device: SmartDevice) -> Binding<Choice> {
        Binding(
            get: { choices[device.id] ?? .skip },
            set: { choices[device.id] = $0 }
        )
    }
}
