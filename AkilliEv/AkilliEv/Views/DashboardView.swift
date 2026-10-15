import SwiftUI

struct DeviceRef: Identifiable {
    let id: String
}

private struct DeviceGroup: Identifiable {
    let title: String
    let devices: [SmartDevice]
    var id: String { title }
}

struct DashboardView: View {
    enum Grouping: String, CaseIterable, Identifiable {
        case room = "Odaya göre"
        case provider = "Platforma göre"
        var id: String { rawValue }
    }

    @Environment(HomeStore.self) private var store
    @State private var filter: ProviderKind?
    @AppStorage("grouping") private var grouping: Grouping = .room
    @State private var search = ""
    @State private var selected: DeviceRef?
    @State private var confirmAllOff = false

    private let columns = [GridItem(.adaptive(minimum: 155), spacing: 12)]

    private var visibleDevices: [SmartDevice] {
        store.devices.filter { device in
            (filter == nil || device.provider == filter)
                && (search.isEmpty || device.name.localizedCaseInsensitiveContains(search)
                    || store.room(for: device).localizedCaseInsensitiveContains(search))
        }
    }

    private var groups: [DeviceGroup] {
        let devices = visibleDevices
        switch grouping {
        case .room:
            return store.rooms.compactMap { room in
                let list = devices.filter { store.room(for: $0) == room }
                return list.isEmpty ? nil : DeviceGroup(title: room, devices: list)
            }
        case .provider:
            return ProviderKind.allCases.compactMap { kind in
                let list = devices.filter { $0.provider == kind }
                return list.isEmpty ? nil : DeviceGroup(title: kind.title, devices: list)
            }
        }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    SummaryHeader()
                    errorBanners
                    if store.activeProviders.count > 1 { providerChips }

                    let favorites = visibleDevices.filter { store.favorites.contains($0.id) }
                    if !favorites.isEmpty {
                        section(title: "Favoriler", symbol: "star.fill", devices: favorites)
                    }
                    ForEach(groups) { group in
                        section(title: group.title, symbol: nil, devices: group.devices)
                    }

                    if store.devices.isEmpty && !store.isLoading {
                        emptyState
                    }
                }
                .padding()
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Akıllı Ev")
            .searchable(text: $search, prompt: "Cihaz veya oda ara")
            .refreshable { await store.refresh() }
            .overlay(alignment: .top) {
                if store.isLoading && store.devices.isEmpty { ProgressView().padding(.top, 80) }
            }
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Menu {
                        Picker("Gruplama", selection: $grouping) {
                            ForEach(Grouping.allCases) { Text($0.rawValue).tag($0) }
                        }
                    } label: {
                        Image(systemName: "line.3.horizontal.decrease.circle")
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        confirmAllOff = true
                    } label: {
                        Image(systemName: "power.circle")
                    }
                    .disabled(!store.devices.contains { $0.online && $0.isOn })
                }
            }
            .confirmationDialog("Açık olan tüm cihazlar kapatılsın mı?", isPresented: $confirmAllOff, titleVisibility: .visible) {
                Button("Tümünü kapat", role: .destructive) {
                    Task { await store.turnEverythingOff() }
                }
            }
            .sheet(item: $selected) { ref in
                DeviceDetailView(deviceId: ref.id)
            }
            .task {
                if store.lastUpdated == nil { await store.refresh() }
            }
        }
    }

    private func section(title: String, symbol: String?, devices: [SmartDevice]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                if let symbol { Image(systemName: symbol).foregroundStyle(.yellow) }
                Text(title).font(.headline)
                Text("\(devices.count)").font(.subheadline).foregroundStyle(.secondary)
            }
            LazyVGrid(columns: columns, spacing: 12) {
                ForEach(devices) { device in
                    DeviceTile(
                        device: device,
                        room: grouping == .room ? nil : store.room(for: device),
                        isFavorite: store.favorites.contains(device.id),
                        onToggle: { Task { await store.toggle(device) } },
                        onOpen: { selected = DeviceRef(id: device.id) }
                    )
                    .contextMenu {
                        Button {
                            store.toggleFavorite(device)
                        } label: {
                            store.favorites.contains(device.id)
                                ? Label("Favorilerden çıkar", systemImage: "star.slash")
                                : Label("Favorilere ekle", systemImage: "star")
                        }
                        Button {
                            selected = DeviceRef(id: device.id)
                        } label: {
                            Label("Ayrıntılar", systemImage: "info.circle")
                        }
                    }
                }
            }
        }
    }

    private var providerChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                chip(title: "Tümü", color: .accentColor, isSelected: filter == nil) { filter = nil }
                ForEach(store.activeProviders) { kind in
                    chip(title: kind.shortTitle, color: kind.color, isSelected: filter == kind) {
                        filter = filter == kind ? nil : kind
                    }
                }
            }
        }
    }

    private func chip(title: String, color: Color, isSelected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.subheadline.weight(.medium))
                .padding(.horizontal, 14)
                .padding(.vertical, 7)
                .background(Capsule().fill(isSelected ? color : Color(.secondarySystemGroupedBackground)))
                .foregroundStyle(isSelected ? .white : .primary)
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private var errorBanners: some View {
        ForEach(ProviderKind.allCases) { kind in
            if let message = store.errors[kind] {
                HStack(alignment: .top, spacing: 10) {
                    Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.orange)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(kind.title).font(.subheadline.weight(.semibold))
                        Text(message).font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                    Button {
                        store.dismissError(for: kind)
                    } label: {
                        Image(systemName: "xmark").foregroundStyle(.secondary)
                    }
                    .buttonStyle(.plain)
                }
                .padding(12)
                .background(RoundedRectangle(cornerRadius: 14).fill(Color.orange.opacity(0.12)))
            }
        }
    }

    private var emptyState: some View {
        ContentUnavailableView {
            Label("Cihaz yok", systemImage: "house")
        } description: {
            Text("Ayarlar sekmesinden eWeLink, Xenon/Tuya veya SmartThings hesabınızı bağlayın ya da Demo modunu açın.")
        }
        .padding(.top, 40)
    }
}

private struct SummaryHeader: View {
    @Environment(HomeStore.self) private var store

    var body: some View {
        let devices = store.devices
        let onCount = devices.filter { $0.online && $0.isOn }.count
        let offline = devices.filter { !$0.online }.count
        let temperatures = devices.compactMap(\.temperature)

        HStack(spacing: 12) {
            stat(value: "\(onCount)", label: "Açık", symbol: "lightbulb.fill", color: .yellow)
            stat(value: "\(devices.count)", label: "Cihaz", symbol: "square.grid.2x2.fill", color: .blue)
            if !temperatures.isEmpty {
                let average = temperatures.reduce(0, +) / Double(temperatures.count)
                stat(value: String(format: "%.1f°", average), label: "Sıcaklık", symbol: "thermometer.medium", color: .red)
            } else {
                stat(value: "\(offline)", label: "Çevrimdışı", symbol: "wifi.slash", color: .gray)
            }
        }
    }

    private func stat(value: String, label: String, symbol: String, color: Color) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Image(systemName: symbol).foregroundStyle(color)
            Text(value).font(.title2.weight(.bold)).monospacedDigit()
            Text(label).font(.caption).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 16).fill(Color(.secondarySystemGroupedBackground)))
    }
}
