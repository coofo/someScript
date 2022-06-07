$(function () {
    webpMachine.webpSupport.then(e => {
        var t = !1, r = "my";
        let a, n, s = "ret";

        async function i(e, t) {
            let a = new XMLHttpRequest;
            a.open("GET", e, !0), a.responseType = "arraybuffer", a.onload = async function () {
                4 == a.readyState && (200 == a.status ? t.src = await d(a.response, r, t) : f(e, key))
            }, a.send()
        }

        function o(e) {
            const t = e.sigBytes, r = e.words, a = new Uint8Array(t);
            for (var n = 0, s = 0; n != t;) {
                var i = r[s++];
                if (a[n++] = (4278190080 & i) >>> 24, n == t) break;
                if (a[n++] = (16711680 & i) >>> 16, n == t) break;
                if (a[n++] = (65280 & i) >>> 8, n == t) break;
                a[n++] = 255 & i
            }
            return a
        }

        r += "2ecret", r += "782ec", r += "ret", $("img.lazy_img").each(function (e) {
            $(this).attr("data-original", "/static/images/imagecover.png"), $(this).on("load", function () {
                $(this).attr("src").indexOf("blob:") > -1 && ($(this).css("width", "auto").css("display", "flex").css("min-height", "0px"), window.URL.revokeObjectURL($(this).attr("src")))
            })
        }), $("img.lazy_img").lazyload({
            threshold: 1e3, effect: "fadeIn", load: function (e) {
                let t = $(this)[0], r;
                t.getAttribute("src").indexOf("blob:") < 0 && i(t.getAttribute("data-r-src"), t)
            }
        });
        const c = e => new Promise(t => setTimeout(t, e)), l = e => {
            let t = new FileReader;
            return t.readAsDataURL(e), new Promise(e => {
                t.onloadend = (() => {
                    e(t.result)
                })
            })
        };

        async function d(r, a, n) {
            let s = r, i = CryptoJS.enc.Utf8.parse(a), l = CryptoJS.lib.WordArray.create(s), d,
                f = o(CryptoJS.AES.decrypt({ciphertext: l}, i, {iv: i, padding: CryptoJS.pad.Pkcs7})), p = "";
            if (e) {
                let e = new Blob([f]);
                p = URL.createObjectURL(e)
            } else {
                let e = 0;
                for (; "" === p && e < 100;) {
                    if (e++, !t) {
                        let e;
                        t = !0, p = await webpMachine.decode(f), t = !1
                    }
                    "" === p && await c(300)
                }
                "" == p && console.log($(n).attr("data-sort"), "fail!!")
            }
            return p
        }

        function f(e, t) {
            let a = new XMLHttpRequest;
            a.open("GET", e, !0), a.responseType = "arraybuffer", a.onload = function () {
                200 == a.status && (t.src = d(a.response, r))
            }, a.send()
        }
    })
});