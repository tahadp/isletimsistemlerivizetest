# İşletim Sistemleri Vize Testi

İlk beş üniteden **50 özgün çoktan seçmeli soru, 250 seçenek**. Sıra Sizde soruları dahil değildir.

Telefon ve masaüstünde çalışan, bağımlılıksız statik site. Ünite seçimi, karışık sıra, çözümden sonra açıklamalar, sonuç ve yanlışları tekrar çözme. İlerleme yalnız ziyaretçinin tarayıcısında saklanır; hesap veya ortak sunucu kaydı yoktur.

## Çalıştırma

Node.js 22 veya üstü ile:

```sh
npm start
```

Tarayıcıda http://127.0.0.1:4173 adresini açın. Dosyayı çift tıklamak yerine HTTP sunucusu kullanın.

```sh
npm run check
```

## Kaynak ve cevap politikası

Ana kaynak Anadolu Üniversitesi İşletim Sistemleri kitabının ilk beş ünitesidir. Kullanıcının sağladığı ayrıntılı vize PDF'lerinin düzenlenebilir metinlerinden aktarılmıştır. Soru ve seçeneklerde düzeltme veya yeniden yazım yapılmaz; yalnız PDF satır düzeni birleştirilir. Tekrarlanan seçenekler korunur. Birleşik PDF aynı soruları içerdiği için ikinci kez eklenmez.

Kitap anahtarı `bookAnswer`, kabul edilen seçenekler `acceptedAnswers` alanındadır. Kaynakta çelişen anahtar ve içerik cevapları birlikte kabul edilir; aynı metinli kabul edilen seçenekler de eşit değerlendirilir. Alternatifler ve gerekçe yalnız cevabı kontrol ettikten sonra gösterilir. Seçeneklerde bulunmayan teknik karşılık yeni seçenek olarak eklenmez, açıklamada belirtilir. Tarihsel sorular kaynak kitabın dönemiyle değerlendirilir.

`data/source-questions.json` taşınabilir kaynak kopyasıdır. `data/answer-overrides.json` denetlenmiş cevap kararlarını içerir. `data/provenance.json` aktarım kaynaklarını ve doğrulama bilgilerini içerir. Python 3 ile soru verisini yeniden oluşturmak için:

```sh
python scripts/build_questions.py
```

## Yayın

Canlı adres: https://isletimsistemleritest.tahatoprak.me/

Depo: https://github.com/tahadp/isletimsistemlerivizetest

Sunucuda mevcut Python 3 ile çalışır; Docker, Nginx, paket kurulumu veya derleme gerekmez:

```sh
python3 scripts/serve.py
```

Yalnız `127.0.0.1:8088` dinlenir. Mevcut Cloudflare Tunnel, alan adını bu localhost adresine yönlendirir ve ziyaretçilere HTTPS sağlar. Sunucunun 80 portu kullanılmaz. `deployment/isletimsistemleritest.service` servisi makine yeniden açıldığında siteyi başlatır.

Sunucu kaynak kopyası `/opt/isletimsistemlerivizetest` içindedir. GitHub güncellemesini yayımlamak için yetkili SSH oturumunda:

```sh
git -C /opt/isletimsistemlerivizetest pull --ff-only
systemctl restart isletimsistemleritest
```

GitHub Actions yalnız veri/puanlama kontrollerini çalıştırır. Kalıcı veritabanı veya sunucuya kurulan Node.js bağımlılığı yoktur.

## İçerik güncelleme

Özgün soru/şık metinlerine dokunmadan gerekli açıklama/cevap kararını kaynak veride güncelleyin. Kaynak belge, sayfa ve gerekçeyi koruyun. Kontrolleri çalıştırın; ardından commit ve push yapın. Tam kitap ve kullanıcı PDF'leri bu depoda yayımlanmaz.
