import SwiftUI

@main
struct AkilliEvApp: App {
    @State private var store = HomeStore()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(store)
        }
    }
}

struct ContentView: View {
    @Environment(HomeStore.self) private var store
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        TabView {
            DashboardView()
                .tabItem { Label("Panel", systemImage: "house.fill") }
            ScenesView()
                .tabItem { Label("Sahneler", systemImage: "sparkles") }
            SettingsView()
                .tabItem { Label("Ayarlar", systemImage: "gearshape.fill") }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active {
                Task { await store.refresh() }
            }
        }
    }
}
