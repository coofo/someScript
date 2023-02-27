// ==UserScript==
// @name         bilibili用户带图动态下载
// @namespace    https://github.com/coofo/someScript
// @version      0.0.2
// @license      AGPL License
// @description  bilibili用户带图动态下载
// @author       coofo
// @updateURL    https://github.com/coofo/someScript/raw/main/tampermonkey/bilibili.user.js
// @downloadURL  https://github.com/coofo/someScript/raw/main/tampermonkey/bilibili.user.js
// @supportURL   https://github.com/coofo/someScript/issues
// @include      /^https://space.bilibili.com/\d+/
// @require      https://cdn.jsdelivr.net/npm/sweetalert2@11
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip/3.1.5/jszip.min.js
// @require      https://greasyfork.org/scripts/442002-coofoutils/code/coofoUtils.js?version=1153835
// @require      https://greasyfork.org/scripts/453330-coofoutils-tampermonkeyutils/code/coofoUtils-tampermonkeyUtils.js?version=1106599
// @require      https://greasyfork.org/scripts/453329-coofoutils-comicinfo/code/coofoUtils-comicInfo.js?version=1106598
// @grant        GM_download
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// @grant        GM_notification
// @grant        window.focus
// ==/UserScript==


(function (tools) {
    'use strict';
    //setting
    let setting = tools.setting;

    Object.assign(setting, {
        def: {
            imageNameTemplate: "[bili-dynamic]/[${userId}]${userName}/${dynamicId}/${index}",

            /**
             * zip文件名格式（包括路径）
             */
            zipNameTemplate: "[bili-dynamic][${userId}]${userName}-${dynamicId}"
        },

        /**
         * 下载线程数量
         * @type {number}
         */
        threadNum: 8,

        /**
         * 下载失败重试次数
         * @type {number}
         */
        downloadRetryTimes: 2
    });

    //设置按钮
    GM_registerMenuCommand("文件名设置", function () {
        let html = `图片名格式<br/><input id="imageNameTemplate" style="width: 90%;"><br/>
                    压缩包名格式<br/><input id="zipNameTemplate" style="width: 90%;"><br/>
                        <!--<button id="saveTemplate">保存</button><button id="resetTemplate">默认值</button>-->`;
        Swal.fire({
            title: '命名模板设置',
            html: html,
            footer: `<div><table border="1">
                             <tr><td>巨集</td><td>说明</td></tr>
                             <tr><td>\${userId}</td><td>用户ID</td></tr>
                             <tr><td>\${userName}</td><td>用户名</td></tr>
                             <tr><td>\${dynamicId}</td><td>动态ID</td></tr>
                             <tr><td>\${index}</td><td>插图序号</td></tr>
                          </table><br>
                          <table border="1">
                             <tr><td>后缀</td><td>说明（取到值时才生效，取不到则替换为空字符串）</td></tr>
                             <tr><td>empty</td><td>未取到时填充为空字符串</td></tr>
                             <tr><td>parenthesis</td><td>圆括号</td></tr>
                             <tr><td>squareBracket</td><td>方括号</td></tr>
                             <tr><td>curlyBracket</td><td>大括号</td></tr>
                             <tr><td>path</td><td>后加文件夹分隔符</td></tr>
                             <tr><td>index2</td><td>向前添0补全至2位</td></tr>
                             <tr><td>index3</td><td>向前添0补全至3位（以此类推）</td></tr>
                         </table></div>`,
            confirmButtonText: '保存',
            showDenyButton: true,
            denyButtonText: `恢复默认`,
            showCancelButton: true,
            cancelButtonText: '取消'
        }).then((result) => {
            if (result.isConfirmed) {
                let templateSetting = {
                    imageNameTemplate: $('#imageNameTemplate').val(),
                    zipNameTemplate: $('#zipNameTemplate').val()
                };
                GM_setValue("templateSetting", templateSetting);
            } else if (result.isDenied) {
                GM_deleteValue("templateSetting");
            }
        });
        let templateSetting = Object.assign({}, setting.def, GM_getValue("templateSetting", {}));

        $('#imageNameTemplate').val(templateSetting.imageNameTemplate);
        $('#zipNameTemplate').val(templateSetting.zipNameTemplate);

    });

    $(document).on('mouseover', ".bili-dyn-list__item", function () {
        if (location.href.match(/^https:\/\/space.bilibili.com\/\d+/) === null) {
            return;
        }
        let item = $(this);
        if (item.attr('bilibiliAddDownload') === 'done') {
            return;
        }
        let imgs = item.find('.bili-dyn-item__main>.bili-dyn-item__body>.bili-dyn-content>.bili-dyn-content__orig>.bili-dyn-content__orig__major>.bili-album>.bili-album__preview>.bili-album__preview__picture>.bili-album__preview__picture__img')
            .toArray();
        if (imgs.length > 0) {
            let footer = item.find('.bili-dyn-item__main>.bili-dyn-item__footer>.bili-dyn-item__action:last');
            footer.after(`<div class="bili-dyn-item__action bilibiliDownload"><div class="bili-dyn-action">⬇下载</div></div>`);
        }
        item.attr('bilibiliAddDownload', 'done');
    });

    $(document).on('click', '.bilibiliDownload', function () {
        Object.assign(setting, setting.def, GM_getValue("templateSetting", {}));
        let item = $(this).parents('.bili-dyn-list__item');
        let userName = item.find('.bili-dyn-item__main>.bili-dyn-item__header>.bili-dyn-title>.bili-dyn-title__text').text().trim();
        let userId = location.href.replace(/.*\/(\d+)\/dynamic/, "$1");
        let desc = item.find('.bili-dyn-item__main>.bili-dyn-item__body>.bili-dyn-content>.bili-dyn-content__orig>.bili-dyn-content__orig__desc span').text();
        let imgs = item.find('.bili-dyn-item__main>.bili-dyn-item__body>.bili-dyn-content>.bili-dyn-content__orig>.bili-dyn-content__orig__major>.bili-album>.bili-album__preview>.bili-album__preview__picture>.bili-album__preview__picture__img')
            .toArray().map(div => tools.bilibili.downloadHelp.getUrlFromDiv($(div)));
        console.log(userName, desc, imgs);

        let downloadPromiseList = [];
        for (let i = 0; i < imgs.length; i++) {
            downloadPromiseList.push(tools.bilibili.downloadHelp.downloadImg(imgs[i]));
        }
        Promise.all(downloadPromiseList).then(async () => {
            let info = {
                userId: userId,
                userName: userName,
                dynamicId: item.find('.bili-dyn-item__main>.bili-dyn-item__body>.bili-dyn-content>.bili-dyn-content__orig>.bili-dyn-content__orig__major>.bili-album').attr('dyn-id')
            };
            let zip = new JSZip();
            {
                let txtName = coofoUtils.commonUtils.format.string.filePathByMap(tools.setting.imageNameTemplate, Object.assign({index: 'info'}, info)) + '.txt';
                let txtInfo = desc + "\n--------------------------------------------------\nimage url:\n";
                for (let i = 0; i < imgs.length; i++) {
                    txtInfo += (imgs[i] + '\n');
                }
                zip.file(txtName, txtInfo);
            }
            for (let i = 0; i < downloadPromiseList.length; i++) {
                let downloadPromise = downloadPromiseList[i];
                let arraybuffer = await downloadPromise;
                let suffix = imgs[i].substring(imgs[i].lastIndexOf("."));
                let name = coofoUtils.commonUtils.format.string.filePathByMap(tools.setting.imageNameTemplate, Object.assign({index: i}, info)) + suffix;
                zip.file(name, arraybuffer);
            }

            let zipFile = await zip.generateAsync({type: "blob", compression: "STORE"});
            let zipFileName = coofoUtils.commonUtils.format.string.filePathByMap(tools.setting.zipNameTemplate, info) + ".zip";
            coofoUtils.commonUtils.downloadHelp.toUser.asHref4Blob(zipFile, zipFileName);
        }, () => {
            Swal.fire("下载失败");
        });
    });


})((function () {
    const constants = {};
    const cache = {};

    const tools = {
        setting: {},
        bilibili: {
            downloadHelp: {
                getUrlFromDiv: function (selector) {
                    let style = selector.attr('style');
                    if (style === undefined) {
                        console.log(selector)
                    }
                    return style.replace(/background-image: url\("(.+)"\);/, "$1").split("@")[0];
                },
                downloadImg: function (url) {
                    return window.coofoUtils.service.retryablePromise.create((res, rej) => {
                        let request = new XMLHttpRequest;
                        request.open("GET", url, !0);
                        request.responseType = "arraybuffer";
                        request.onload = function () {
                            if (200 === request.status) {
                                res(request.response);
                            } else {
                                rej();
                            }
                        };
                        request.onerror = () => {
                            rej();
                        };
                        request.send();
                    }, tools.setting.downloadRetryTimes);
                }
            }
        }
    };
    return tools;
})());