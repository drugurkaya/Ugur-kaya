import SwiftUI

struct SettingsView: View {
    @Environment(HomeStore.self) private var store

    var body: some View {
        @Bindable var store = store
        NavigationStack {
            Form {
                Section {
                    NavigationLink { EWeLinkSettingsView() } label: { row(.ewelink) }
                    NavigationLink { TuyaSettingsView() } label: { row(.tuya) }
                    NavigationLink { SmartThingsSettingsView() } label: { row(.smartthings) }
                } header: {
                    Text("Platformlar")
                } footer: {
                    Text("Xenon Smart cihazları Tuya altyapısını kullanır; Smart Life ve Tuya Smart cihazları da aynı bölümden bağlanır.")
                }

                Section {
                    Toggle("Demo cihazlarını göster", isOn: $store.demoMode)
                } footer: {
                    Text("Hesap bağlamadan paneli denemek için örnek cihazlar.")
                }

                Section("Hakkında") {
                    LabeledContent("Cihaz sayısı", value: "\(store.devices.count)")
                    if let updated = store.lastUpdated {
                        LabeledContent("Son güncelleme", value: updated.formatted(date: .omitted, time: .shortened))
                    }
                    Text("API anahtarları ve oturum bilgileri yalnızca bu iPhone'un Keychain'inde saklanır; cihazlarınızla doğrudan platformların kendi bulut sunucuları üzerinden konuşulur.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Ayarlar")
        }
    }

    private func row(_ kind: ProviderKind) -> some View {
        HStack {
            Label(kind.title, systemImage: kind.symbol).foregroundStyle(.primary)
            Spacer()
            if store.activeProviders.contains(kind) {
                Text(store.errors[kind] == nil ? "Bağlı" : "Hata")
                    .font(.caption)
                    .foregroundStyle(store.errors[kind] == nil ? .green : .orange)
            } else {
                Text("Bağlı değil").font(.caption).foregroundStyle(.secondary)
            }
        }
    }
}

/// Ayar ekranlarında ortak: kaydet, paneli yenile.
private extension HomeStore {
    func applySettings() {
        reloadProviders()
        Task { await refresh() }
    }
}

private struct SecretField: View {
    let title: String
    @Binding var text: String

    var body: some View {
        SecureField(title, text: $text)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
    }
}

private struct PlainField: View {
    let title: String
    @Binding var text: String

    var body: some View {
        TextField(title, text: $text)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .keyboardType(.URL)
    }
}

// MARK: - eWeLink

private struct EWeLinkSettingsView: View {
    @Environment(HomeStore.self) private var store
    @State private var config = ConfigStore.load(EWeLinkConfig.self, key: EWeLinkConfig.key) ?? EWeLinkConfig()
    @State private var loginURL: IdentifiedURL?
    @State private var message: String?
    @State private var busy = false
    @State private var oauthState = UUID().uuidString

    var body: some View {
        Form {
            Section {
                PlainField(title: "APPID", text: $config.appId)
                SecretField(title: "APP SECRET", text: $config.appSecret)
                PlainField(title: "Yönlendirme (Redirect) URL", text: $config.redirectURL)
            } header: {
                Text("Geliştirici uygulaması")
            } footer: {
                Text("dev.ewelink.cc adresinde ücretsiz geliştirici hesabı açıp bir uygulama oluşturun. Oradaki Redirect URL ile buradaki aynı olmalı.")
            }

            Section {
                if config.isLoggedIn {
                    Label("Bağlı · bölge: \(config.region.uppercased())", systemImage: "checkmark.circle.fill")
                        .foregroundStyle(.green)
                }
                Button(config.isLoggedIn ? "Yeniden giriş yap" : "eWeLink hesabıyla giriş yap") {
                    save()
                    oauthState = UUID().uuidString
                    loginURL = EWeLinkProvider.authorizationURL(config: config, state: oauthState).map(IdentifiedURL.init)
                }
                .disabled(!config.hasCredentials || busy)
                if config.isLoggedIn {
                    Button("Bağlantıyı kes", role: .destructive) {
                        config.accessToken = nil
                        config.refreshToken = nil
                        save()
                    }
                }
            }

            if busy { ProgressView() }
            if let message {
                Section { Text(message).font(.callout) }
            }
        }
        .navigationTitle("eWeLink")
        .sheet(item: $loginURL) { item in
            OAuthLoginView(title: "eWeLink giriş", url: item.url, redirectPrefix: config.redirectURL) { params in
                handle(params)
            }
        }
        .onDisappear { save() }
    }

    private func handle(_ params: [String: String]) {
        guard let code = params["code"], !code.isEmpty else {
            message = "Giriş tamamlanamadı."
            return
        }
        if let state = params["state"], state != oauthState {
            message = "Güvenlik doğrulaması başarısız (state uyuşmuyor)."
            return
        }
        busy = true
        Task {
            defer { busy = false }
            do {
                config = try await EWeLinkProvider.exchangeCode(code, region: params["region"] ?? config.region, config: config)
                save(mergeStoredTokens: false)
                message = "Bağlandı. Cihazlar panelde görünecek."
            } catch {
                message = error.localizedDescription
            }
        }
    }

    private func save(mergeStoredTokens: Bool = true) {
        // Sağlayıcı arka planda token yenilemiş olabilir; en güncel token'ları koru.
        if mergeStoredTokens, let stored = ConfigStore.load(EWeLinkConfig.self, key: EWeLinkConfig.key),
           stored.appId == config.appId, config.accessToken != nil, stored.accessToken != nil {
            config.accessToken = stored.accessToken
            config.refreshToken = stored.refreshToken
        }
        ConfigStore.save(config, key: EWeLinkConfig.key)
        store.applySettings()
    }
}

// MARK: - Tuya / Xenon

private struct TuyaSettingsView: View {
    @Environment(HomeStore.self) private var store
    @State private var config = ConfigStore.load(TuyaConfig.self, key: TuyaConfig.key) ?? TuyaConfig()
    @State private var message: String?
    @State private var busy = false

    var body: some View {
        Form {
            Section {
                PlainField(title: "Access ID / Client ID", text: $config.accessId)
                SecretField(title: "Access Secret / Client Secret", text: $config.accessSecret)
                Picker("Veri merkezi", selection: $config.region) {
                    ForEach(TuyaRegion.allCases) { Text($0.title).tag($0) }
                }
            } header: {
                Text("Tuya IoT Platform projesi")
            } footer: {
                Text("platform.tuya.com'da bir Cloud projesi açın, Devices › Link App Account bölümünden Smart Life / Tuya Smart hesabınızı QR kodla bağlayın. Türkiye için veri merkezi genellikle Orta Avrupa'dır.")
            }

            Section {
                Button("Kaydet ve bağlantıyı test et") { test() }
                    .disabled(!config.isReady || busy)
                if config.isReady {
                    Button("Bağlantıyı kaldır", role: .destructive) {
                        config = TuyaConfig()
                        ConfigStore.save(TuyaConfig?.none, key: TuyaConfig.key)
                        store.applySettings()
                        message = nil
                    }
                }
            }

            if busy { ProgressView() }
            if let message {
                Section { Text(message).font(.callout) }
            }
        }
        .navigationTitle("Xenon / Tuya")
        .onDisappear {
            if config.isReady {
                ConfigStore.save(config, key: TuyaConfig.key)
                store.applySettings()
            }
        }
    }

    private func test() {
        ConfigStore.save(config, key: TuyaConfig.key)
        busy = true
        let provider = TuyaProvider(config: config)
        Task {
            defer { busy = false }
            do {
                let devices = try await provider.fetchDevices()
                message = devices.isEmpty
                    ? "Bağlantı başarılı ancak cihaz bulunamadı. Uygulama hesabınızı projeye bağladığınızdan emin olun."
                    : "Bağlantı başarılı: \(devices.count) cihaz bulundu."
            } catch {
                message = error.localizedDescription
            }
            store.applySettings()
        }
    }
}

// MARK: - SmartThings

private struct SmartThingsSettingsView: View {
    @Environment(HomeStore.self) private var store
    @State private var config = ConfigStore.load(SmartThingsConfig.self, key: SmartThingsConfig.key) ?? SmartThingsConfig()
    @State private var loginURL: IdentifiedURL?
    @State private var message: String?
    @State private var busy = false

    var body: some View {
        Form {
            Section {
                Picker("Yöntem", selection: $config.mode) {
                    ForEach(SmartThingsAuthMode.allCases) { Text($0.title).tag($0) }
                }
                .pickerStyle(.segmented)
            } footer: {
                Text(config.mode == .token
                     ? "account.smartthings.com/tokens adresinden token oluşturun (devices ve locations izinleri). Not: Yeni kişisel token'lar 24 saat geçerlidir; kalıcı kullanım için OAuth önerilir."
                     : "SmartThings CLI ile (smartthings apps:create) bir OAuth-In uygulaması oluşturun; Redirect URI buradaki adresle aynı olmalı. Kapsamlar: r:devices:* x:devices:* r:locations:*")
            }

            if config.mode == .token {
                Section("Kişisel erişim token'ı") {
                    SecretField(title: "Token", text: $config.personalToken)
                }
            } else {
                Section("OAuth uygulaması") {
                    PlainField(title: "Client ID", text: $config.clientId)
                    SecretField(title: "Client Secret", text: $config.clientSecret)
                    PlainField(title: "Redirect URI", text: $config.redirectURL)
                }
                Section {
                    if config.refreshToken != nil {
                        Label("Bağlı", systemImage: "checkmark.circle.fill").foregroundStyle(.green)
                    }
                    Button(config.refreshToken == nil ? "SmartThings hesabıyla giriş yap" : "Yeniden giriş yap") {
                        save()
                        loginURL = SmartThingsProvider.authorizationURL(config: config).map(IdentifiedURL.init)
                    }
                    .disabled(!config.hasOAuthCredentials || busy)
                }
            }

            Section {
                Button("Kaydet ve bağlantıyı test et") { test() }
                    .disabled(!config.isReady || busy)
                if config.isReady {
                    Button("Bağlantıyı kaldır", role: .destructive) {
                        config = SmartThingsConfig()
                        ConfigStore.save(SmartThingsConfig?.none, key: SmartThingsConfig.key)
                        store.applySettings()
                        message = nil
                    }
                }
            }

            if busy { ProgressView() }
            if let message {
                Section { Text(message).font(.callout) }
            }
        }
        .navigationTitle("SmartThings")
        .sheet(item: $loginURL) { item in
            OAuthLoginView(title: "SmartThings giriş", url: item.url, redirectPrefix: config.redirectURL) { params in
                handle(params)
            }
        }
        .onDisappear { save() }
    }

    private func handle(_ params: [String: String]) {
        guard let code = params["code"], !code.isEmpty else {
            message = "Giriş tamamlanamadı."
            return
        }
        busy = true
        Task {
            defer { busy = false }
            do {
                config = try await SmartThingsProvider.exchangeCode(code, config: config)
                save(mergeStoredTokens: false)
                message = "Bağlandı. Cihazlar panelde görünecek."
            } catch {
                message = error.localizedDescription
            }
        }
    }

    private func test() {
        save()
        busy = true
        let provider = SmartThingsProvider(config: config)
        Task {
            defer { busy = false }
            do {
                let devices = try await provider.fetchDevices()
                message = "Bağlantı başarılı: \(devices.count) cihaz bulundu."
            } catch {
                message = error.localizedDescription
            }
            store.applySettings()
        }
    }

    private func save(mergeStoredTokens: Bool = true) {
        if mergeStoredTokens, let stored = ConfigStore.load(SmartThingsConfig.self, key: SmartThingsConfig.key),
           stored.clientId == config.clientId, config.refreshToken != nil, stored.refreshToken != nil {
            config.accessToken = stored.accessToken
            config.refreshToken = stored.refreshToken
            config.tokenExpiry = stored.tokenExpiry
        }
        if config.mode == .token || config.hasOAuthCredentials || config.isReady {
            ConfigStore.save(config, key: SmartThingsConfig.key)
        }
        store.applySettings()
    }
}

private struct IdentifiedURL: Identifiable {
    let url: URL
    var id: String { url.absoluteString }
}
