#!/usr/bin/env bash
# Uygulamayı mevcut bir Home Assistant kurulumuna yükler.
#
# Kullanım (HA yapılandırma klasörüne erişimi olan bir terminalde, ör. HA OS "Terminal & SSH" eklentisi,
# Samba paylaşımı bağlanmış bir bilgisayar veya Docker sunucusu):
#   deployment/install_to_ha.sh /config
#
# Yaptıkları:
#   * <config>/www/unified-smart-home/  -> uygulama dosyaları (varsa önce yedeklenir)
#   * <config>/packages/unified_smart_home.yaml -> bildirim paketi (yalnızca --with-package ile)
# YAPMADIKLARI:
#   * configuration.yaml dosyasını DEĞİŞTİRMEZ (gerekli satırı ekrana yazar)
#   * Mevcut otomasyon, entegrasyon veya cihazlara dokunmaz
#   * HA'yı yeniden başlatmaz
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG="${1:?Kullanım: install_to_ha.sh <HA yapılandırma klasörü> [--with-package]}"
WITH_PACKAGE="${2:-}"

if [ ! -f "$CONFIG/configuration.yaml" ]; then
  echo "HATA: $CONFIG içinde configuration.yaml yok. Doğru HA yapılandırma klasörünü verin." >&2
  exit 1
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$CONFIG/www"
if [ -d "$CONFIG/www/unified-smart-home" ]; then
  mkdir -p "$CONFIG/www/.ush-backups"
  mv "$CONFIG/www/unified-smart-home" "$CONFIG/www/.ush-backups/unified-smart-home-$STAMP"
  echo "Önceki sürüm yedeklendi: www/.ush-backups/unified-smart-home-$STAMP"
fi
cp -r "$HERE/app" "$CONFIG/www/unified-smart-home"
echo "Uygulama kuruldu: $CONFIG/www/unified-smart-home"

if [ "$WITH_PACKAGE" = "--with-package" ]; then
  mkdir -p "$CONFIG/packages"
  if [ -f "$CONFIG/packages/unified_smart_home.yaml" ]; then
    cp "$CONFIG/packages/unified_smart_home.yaml" "$CONFIG/packages/unified_smart_home.yaml.bak-$STAMP"
  fi
  cp "$HERE/ha-config/packages/unified_smart_home.yaml" "$CONFIG/packages/unified_smart_home.yaml"
  if ! grep -q "packages:" "$CONFIG/configuration.yaml"; then
    cat <<'EOF'

configuration.yaml dosyanıza ŞU SATIRLARI ELLE ekleyin (dosyanız otomatik değiştirilmedi):

homeassistant:
  packages: !include_dir_named packages

Ardından HA > Geliştirici araçları > YAML > "Yapılandırmayı kontrol et" ve sonra yeniden başlatın.
EOF
  fi
fi

cat <<EOF

Kurulum tamam. Uygulama adresi:
  http(s)://<home-assistant-adresiniz>/local/unified-smart-home/index.html

Not: /local/ yolu ilk kez kullanılıyorsa (www klasörü yeni oluşturulduysa) HA'nın bir kez yeniden
başlatılması gerekir. Geri almak için: rm -rf "$CONFIG/www/unified-smart-home"
EOF
