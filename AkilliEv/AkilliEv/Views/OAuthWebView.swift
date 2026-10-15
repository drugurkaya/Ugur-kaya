import SwiftUI
import WebKit

/// Platformun kendi giriş sayfasını gösterir; yönlendirme (redirect) adresine
/// gelindiğinde sayfayı yüklemeden adresteki `code` vb. değerleri yakalar.
struct OAuthLoginView: View {
    let title: String
    let url: URL
    let redirectPrefix: String
    let onResult: ([String: String]) -> Void

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            OAuthWebView(url: url, redirectPrefix: redirectPrefix) { params in
                onResult(params)
                dismiss()
            }
            .ignoresSafeArea(edges: .bottom)
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Vazgeç") { dismiss() }
                }
            }
        }
    }
}

private struct OAuthWebView: UIViewRepresentable {
    let url: URL
    let redirectPrefix: String
    let onRedirect: ([String: String]) -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(redirectPrefix: redirectPrefix, onRedirect: onRedirect)
    }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.load(URLRequest(url: url))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {}

    @MainActor
    final class Coordinator: NSObject, WKNavigationDelegate {
        private let redirectPrefix: String
        private let onRedirect: ([String: String]) -> Void
        private var finished = false

        init(redirectPrefix: String, onRedirect: @escaping ([String: String]) -> Void) {
            self.redirectPrefix = redirectPrefix
            self.onRedirect = onRedirect
        }

        /// Adres yönlendirme adresiyle başlıyorsa parametreleri yakalar.
        private func capture(_ url: URL?) -> Bool {
            guard !finished, let url, url.absoluteString.hasPrefix(redirectPrefix) else { return false }
            finished = true
            var params: [String: String] = [:]
            for item in URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? [] {
                params[item.name] = item.value ?? ""
            }
            onRedirect(params)
            return true
        }

        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction) async -> WKNavigationActionPolicy {
            capture(navigationAction.request.url) ? .cancel : .allow
        }

        func webView(_ webView: WKWebView, didReceiveServerRedirectForProvisionalNavigation navigation: WKNavigation!) {
            if capture(webView.url) { webView.stopLoading() }
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            let failing = (error as NSError).userInfo[NSURLErrorFailingURLStringErrorKey] as? String
            _ = capture(failing.flatMap(URL.init(string:)))
        }
    }
}
