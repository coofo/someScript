// ==UserScript==
// @name         ehentai ComicInfo.xml 生成
// @namespace    https://github.com/coofo/someScript
// @version      0.0.1
// @license      AGPL License
// @description  下载
// @author       coofo
// @updateURL    https://github.com/coofo/someScript/raw/main/tampermonkey/ehentai.user.js
// @downloadURL  https://github.com/coofo/someScript/raw/main/tampermonkey/ehentai.user.js
// @supportURL   https://github.com/coofo/someScript/issues
// @include      /^https://e-hentai.org/g/\d+/[0-9a-z]+/
// @require      https://cdnjs.cloudflare.com/ajax/libs/jquery/3.6.0/jquery.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip/3.1.5/jszip.min.js
// @require      https://greasyfork.org/scripts/442002-coofoutils/code/coofoUtils.js?version=1084326
// @grant        GM_registerMenuCommand
// ==/UserScript==


(function (tools) {
    'use strict';

    //设置按钮
    GM_registerMenuCommand("生成 ComicInfo.xml", function () {
        let tag = {};
        $("#taglist tr").toArray().forEach(o => {
            let tagGroup = $(o).find("td.tc").text().replace(":","");
            let tags = $(o).find("div>a").toArray().map(o=>$(o).text());
            tag[tagGroup] = tags;
        });

        let info = {
            bigTitle:$("#gn").text(),
            smallTitle:$("#gj").text(),
            uploader:$("#gdn>a").text(),
            tag:tag,
            language:$("#gdd tr:contains(Language) td.gdt2").text().replace(/^([a-zA-Z]+).*$/,'$1')
        };
        console.log(info);



        let xmlInfo = {
            Publisher: ['e-hentai', info.uploader],
            LanguageISO: tools.getLanguageISO(info.language)
        };

        let xml = coofoUtils.comicInfoUtils.create(xmlInfo);
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
                        return 'zh';
                    case 'japanese':
                        return 'ja';
                    case 'english':
                        return 'en';
                    case 'french':
                        return 'fr';
                    case 'korean':
                        return 'ko';
                    default:
                        return null;
                }
            }).filter(o => o !== null);
        }
    };
})());