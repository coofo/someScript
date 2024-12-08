// ==UserScript==
// @name         ehentai ComicInfo.xml 生成
// @namespace    https://github.com/coofo/someScript
// @version      0.0.3
// @license      AGPL License
// @description  下载
// @author       coofo
// @updateURL    https://github.com/coofo/someScript/raw/main/tampermonkey/ehentai.user.js
// @downloadURL  https://github.com/coofo/someScript/raw/main/tampermonkey/ehentai.user.js
// @supportURL   https://github.com/coofo/someScript/issues
// @include      /^https://e-hentai.org/g/\d+/[0-9a-z]+/
// @include      /^https://exhentai.org/g/\d+/[0-9a-z]+/
// @require      https://cdnjs.cloudflare.com/ajax/libs/jquery/3.6.0/jquery.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip/3.1.5/jszip.min.js
// @require      https://update.greasyfork.org/scripts/442002/1153835/coofoUtils.js
// @require      https://update.greasyfork.org/scripts/453329/1340176/coofoUtils-comicInfo.js
// @grant        GM_registerMenuCommand
// ==/UserScript==


(function (tools) {
    'use strict';

    //设置按钮
    GM_registerMenuCommand("生成 ComicInfo.xml", function () {
        let tag = {};
        $("#taglist tr").toArray().forEach(o => {
            let tagGroup = $(o).find("td.tc").text().replace(":", "");
            let tags = $(o).find("div>a").toArray().map(o => $(o).text());
            tag[tagGroup] = tags;
        });

        let info = {
            bigTitle: $("#gn").text().trim(),
            smallTitle: $("#gj").text(),
            uploader: $("#gdn>a").text(),
            tag: tag,
            language: $("#gdd tr:contains(Language) td.gdt2").text().replace(/^([a-zA-Z]+).*$/, '$1')
        };
        console.log(info);

        let tags = [];
        for (let key in info.tag) {
            if (info.tag.hasOwnProperty(key) && !['artist'].includes(key)) {
                tags = tags.concat(info.tag[key]);
            }
        }


        let xmlInfo = {
            Series: info.smallTitle ? info.smallTitle : info.bigTitle,
            LocalizedSeries: info.bigTitle,
            Writer: info.tag.artist,
            Publisher: ['e-hentai', info.uploader],
            Tags: tags,
            LanguageISO: tools.getLanguageISO([info.language])
        };

        let xml = coofoUtils.comicInfoUtils.create(xmlInfo);
        coofoUtils.commonUtils.downloadHelp.toUser.asTagA4Blob(xml, 'ComicInfo.xml');
    })

})((function () {
    return {
        getLanguageISO: function (array) {
            if (array === null || array === undefined) {
                return null;
            }
            return array.filter(o => o !== 'translated').map(o => {
                switch (o.toLowerCase()) {
                    case 'chinese':
                    case '汉语':
                        return 'zh';
                    case 'japanese':
                    case '日语':
                        return 'ja';
                    case 'english':
                    case '英语':
                        return 'en';
                    case 'french':
                        return 'fr';
                    case 'korean':
                    case '韩语':
                        return 'ko';
                    default:
                        return null;
                }
            }).filter(o => o !== null);
        }
    };
})());