import { charOfStyleTag } from "../cons";
import { token } from "../token";
import { breakLines } from 'textbox-for-pdfkit';
import * as path from 'path';
import { isBlankLineAfterStlyle } from "../utils";

export class Liner {
    printTakeNumbers: boolean = false;
    h: any = {}
    _state = "normal"; // 'dialogue'

    constructor(helper: any, printTakeNumbers: boolean) {
        this.h = helper;
        this.printTakeNumbers = printTakeNumbers;
    }

    get_max_idx = (text: any, max: any): any => {
        var idx = 0;
        var len = 0;
        for (var i = 0; i < text.length; i++) {
            // 判断字符是否 双角
            if (text.charCodeAt(i) > 255) {
                // 是双角, 长度按 1.5 增加
                len += 1.6;
            } else if (text[i] === " ") {
                //空格按0增加
                len += 0.5;
            } else {
                len += 1;
            }
            if (len > max) {
                break;
            }
            idx = i;
        }
        return idx;
    }


    split_text = (text: any, max: any, index: any, token: token): any => {
        var maxIdx = this.get_max_idx(text, max);
        if (text.length <= maxIdx + 1) {
            var tmpText;

            if (token.type === "character" && this.printTakeNumbers) {
                tmpText = token.takeNumber + " - " + text;
            } else {
                tmpText = text;
            }

            return [this.h.create_line({
                type: token.type,
                token: token,
                text: tmpText,
                start: index,
                end: index + text.length - 1
            })];
        }

        var thisEndIdx = maxIdx;
        var nextStarIdx = maxIdx + 1;

        //处理英语单词，不截断单词
        if (text.charCodeAt(maxIdx) <= 255) {
            for (var i = maxIdx; i >= 0; i--) {
                if (text[i] === " ") {
                    if (i > 0) {
                        thisEndIdx = i - 1;
                        nextStarIdx = i + 1;
                    }
                    break;
                } else if (text.charCodeAt(i) > 255) {
                    thisEndIdx = i;
                    nextStarIdx = i + 1;
                    break;
                }
            }
        }

        return [this.h.create_line({
            type: token.type,
            token: token,
            text: text.substr(0, thisEndIdx + 1),
            start: index,
            end: index + thisEndIdx
        })].concat(this.split_text(text.substr(nextStarIdx), max, index + nextStarIdx, token));
    };



    split_token = (token: any, max: number) => {
        // token.lines = this.split_text(token.text || "", max, token.start, token);
        token.lines = this.split_text(token.text || "", max, token.start, token);
    };
    split_token2 = (token: any, width: number, font: string, fontSize: number, doc: any, exclude: string): any => {
        var tmpText;

        if (token.type === "character" && this.printTakeNumbers) {
            tmpText = token.takeNumber + " - " + token.text;
        } else {
            tmpText = token.text;
        }

        var bl = breakLines(tmpText, width, font, fontSize, doc, exclude);
        var res = [];
        var st = 0;
        for (var i = 0; i < bl.length; i++) {
            var l = bl[i].length;
            res.push(this.h.create_line({
                type: token.type,
                token: token,
                text: bl[i],
                start: st,
                end: st + l - 1
            }))
            st += l;
        }
        token.lines = res;
        // return res;
    }

    default_breaker = (index: number, lines: any, cfg: any) => {
        var CONTD = cfg.text_contd || "(CONT'D)";
        var MORE = cfg.text_more || "(MORE)";


        // possible break is after this token
        var token_on_break = lines[index];

        for (var before = index - 1; before && !(lines[before].text); before--) {
        }
        for (var after = index + 1; after < lines.length && !(lines[after].text); after++) {
        }
        var token_after = lines[after];
        // var token_before = lines[before];

        if (token_on_break.is("scene_heading") && token_after && !token_after.is("scene_heading")) {
            return false; // TODO Arming (2024-09-06) :  如果页尾 是 scene 头，放到下一页去，所以此处返回false不在此行分页。外部回继续往前一行找再次判断是否应该截断分页。
        } else if (token_after && token_after.is("transition") && !token_on_break.is("transition")) {
            return false; // todo 如果页面是 转场的前一行内容，放到下一页去，让下一页不至于一开头就是一个转场句子
        }
        // action block 1,2 or 3 lines.
        // don't break unless it's the last line
        else if (token_on_break.is("action") &&
            token_on_break.token.lines.length < 4 &&
            token_on_break.token.lines.indexOf(token_on_break) !== token_on_break.token.lines.length - 1) {
            return false;
        }
        // for and more lines
        // break on any line different than first and penultimate
        // ex.
        // aaaaaaaaa <--- don't break after this line
        // aaaaaaaaa <--- allow breaking after this line
        // aaaaaaaaa <--- allow breaking after this line
        // aaaaaaaaa <--- don't break after this line
        // aaaaaaaaa <--- allow breaking after this line
        else if (token_on_break.is("action") &&
            token_on_break.token.lines.length >= 4 &&
            (token_on_break.token.lines.indexOf(token_on_break) === 0 ||
                token_on_break.token.lines.indexOf(token_on_break) === token_on_break.token.lines.length - 2)) {
            return false;
        } else if (cfg.split_dialogue && token_on_break.is("dialogue", "character", "parenthetical") && !(token_on_break.dual)) {
            // for (var before2 = index - 1; before2 && !(lines[before2].text) && lines[before2].type !== "separator" && lines[before2].type !== "page_break"; before--) {
            // }
            // for (var after2 = index + 1; after2 < lines.length && !(lines[after2].text) && lines[after2].type !== "separator" && lines[after2].type !== "page_break"; after++) {
            // }
            var token_after2 = lines[index + 1];
            var token_before2 = lines[index - 1];

            if (!token_after2 || !token_after2.is("dialogue", "parenthetical")) {
                return true;
            } else if (!token_before2.is("dialogue", "parenthetical")) {
                return false;
            } else {
                var after_is_fake = token_after2.type === 'dialogue_fake';
                for (var character = index - 1; lines[character] && lines[character].type !== "character"; character--) {
                }
                var new_page_character;
                var charactername = "";
                if (lines[character]) charactername = lines[character].text;

                if (after_is_fake) {
                    let moreitem = {
                        type: "more",
                        text: "",
                        start: token_on_break.start,
                        end: token_on_break.end,
                        token: token_on_break.token
                    };
                    lines.splice(index + 1, 0, new_page_character = this.h.create_line({
                        type: "character",
                        text: "",
                        start: token_after2.start,
                        end: token_after2.end,
                        token: token_on_break.token
                    }), this.h.create_line(moreitem));
                } else {
                    let moreitem = {
                        type: "more",
                        text: MORE,
                        start: token_on_break.start,
                        end: token_on_break.end,
                        token: token_on_break.token
                    };
                    lines[index - 1].text = lines[index - 1].text + charOfStyleTag.style_left_stash; //加上样式 stash 标记
                    lines[index].text = charOfStyleTag.style_left_pop + lines[index].text; // 加上样式 恢复 标记
                    lines.splice(index, 0, this.h.create_line(moreitem), new_page_character = this.h.create_line({
                        type: "character",
                        text: charactername.trim() + " " + (charactername.indexOf(CONTD) !== -1 ? "" : CONTD),
                        start: token_after2.start,
                        end: token_after2.end,
                        token: token_on_break.token
                    }));
                }


                if (lines[character] && lines[character].right_column) {
                    var dialogue_on_page_length = index - character;
                    if (lines[character].right_column.length > dialogue_on_page_length) {

                        var right_lines_on_this_page = lines[character].right_column.slice(0, dialogue_on_page_length).concat([
                            this.h.create_line({
                                type: "more",
                                text: MORE,
                                start: token_on_break.start,
                                end: token_on_break.end,
                                token: token_on_break.token
                            })
                        ]),
                            right_lines_for_next_page = [this.h.create_line({
                                type: "character",
                                text: right_lines_on_this_page[0].text.trim() + " " + (right_lines_on_this_page[0].text.indexOf(CONTD) !== -1 ? "" : CONTD),
                                start: token_after2.start,
                                end: token_after2.end,
                                token: token_on_break.token
                            })
                            ].concat(lines[character].right_column.slice(dialogue_on_page_length));


                        right_lines_on_this_page[right_lines_on_this_page.length - 2].text = right_lines_on_this_page[right_lines_on_this_page.length - 2].text + charOfStyleTag.style_right_stash; //加上样式 stash 标记
                        right_lines_for_next_page[1].text = charOfStyleTag.style_right_pop + right_lines_for_next_page[1].text; // 加上样式 恢复 标记

                        lines[character].right_column = right_lines_on_this_page;
                        if (right_lines_for_next_page.length > 1) {
                            new_page_character.right_column = right_lines_for_next_page;
                        }
                    }
                }

                return true;
            }
        }
        return true;
    };

    break_lines = (lines: any, max: number, breaker: any, cfg: any): any => {

        var maxPlus = max;
        // 删除每页开头的空行 包括换行. 但要保留对话左右对齐补的空行
        for (var i = 0; i < lines.length; i++) {
            if (lines[0].type === "dialogue_fake" || lines[0].type === "more" || lines[0].type === "character") {
                break;
            }
            if (lines[i].type === "page_break" || lines[i].text.trim().length === 0) {
                // 删除
                lines.splice(i, 1);
                i--;
            } else if (isBlankLineAfterStlyle(lines[i].text)) {
                // 只含有样式字符
                // 保留
                maxPlus ++; // 后面绘制时，会忽略页面开头的空样式行，所以最多行max值要增加
            } else {
                // 当页第一个非空行
                break
            }
        }


        // while (lines.length && (!(lines[0].text) || lines[0].type === "page_break")
        //     && lines[0].type !== "dialogue_fake" && lines[0].type !== "more" && lines[0].type !== "character") {
        //     lines.shift();
        // }

        var s = maxPlus;
        var p, internal_break = 0;
        var found_internal_break = false;

        for (var i = 0; i < lines.length && i < maxPlus; i++) {
            if (lines[i].type === "page_break") {
                internal_break = i;
                found_internal_break = true;
                break;
            }
        }

        if (!found_internal_break) {
            if (lines.length <= maxPlus) {
                return lines;
            }
            do {
                for (p = s - 1; p && (isBlankLineAfterStlyle(lines[p].text) && lines[p].type !== "dialogue_fake"); p--) { 
                }
                s = p;
            } while (p && !breaker(p, lines, cfg));
            if (!p) {
                p = maxPlus;
            }
        } else {
            p = internal_break;
        }
        var page = lines.slice(0, p + 1);

        // if scene is not finished (next not empty token is not a heading) - add (CONTINUED)
        var next_page_line_index = p + 1,
            next_page_line = null,
            scene_split = false;
        while (next_page_line_index < lines.length && next_page_line === null) {
            if (lines[next_page_line_index].type !== "separator" && lines[next_page_line_index].type !== "page_break") {
                next_page_line = lines[next_page_line_index];
            }
            next_page_line_index++;
        }

        if (next_page_line && next_page_line.type !== "scene_heading") {
            scene_split = true;
        }

        if (found_internal_break) {
            page[page.length - 1].scene_split = scene_split;
        } else {
            page.push(this.h.create_line({
                type: "page_break",
                scene_split: scene_split
            }));
        }
        var append = this.break_lines(lines.slice(p + 1), max, breaker, cfg);
        return page.concat(append);
    };

    fold_dual_dialogue = (lines: any) => {
        var any_unfolded_dual_dialogue_exists = true;

        var get_first_unfolded_dual_left = () => {
            for (var i = 0; i < lines.length; i++) {
                if (lines[i].token &&
                    lines[i].token.type === "character" &&
                    lines[i].token.dual === "left" &&
                    lines[i].right_column === undefined) {
                    return i;
                }
            }
            return -1;
        };
        var get_first_unfolded_dual_right_index_from = (index: number) => {
            for (var i = index; i < lines.length; i++) {
                if (lines[i].token &&
                    lines[i].token.type === "character" &&
                    lines[i].token.dual === "right") {
                    return i;
                }
            }
            return -1;
        };
        var count_dialogue_tokens = (i: number) => {
            var result = 0;
            var canbeCharacter = true;
            while (lines[i] && (lines[i].type == "parenthetical" || lines[i].type == "dialogue" || (canbeCharacter && lines[i].type == "character"))) {
                if (lines[i].type != "character") canbeCharacter = false;
                result++;
                i++;
            }
            return result;
        };
        var fold_dual_dialogue = (left_index: number, right_index: number) => {
            var dialogue_tokens = count_dialogue_tokens(right_index);
            var left_tokens = count_dialogue_tokens(left_index);
            var right_lines = lines.splice(right_index, dialogue_tokens);
            lines[left_index].right_column = right_lines;

            if (dialogue_tokens > left_tokens) {
                //There's more dialogue lines on the right than on the left:
                //Insert dummy lines onto the left so it's the same length as the right.
                let insertLength = dialogue_tokens - left_tokens;
                let insertArray: any[] = [];
                let ii = 0;
                while (insertLength > 0) {
                    // insertArray.push(this.h.create_line({
                    //     type: lines[left_index + left_tokens].type,
                    //     token: lines[left_index + left_tokens].token,
                    //     text: '',
                    //     start: lines[left_index + left_tokens].start,
                    //     end: lines[left_index + left_tokens].end
                    // }));
                    insertArray.push(this.h.create_line({
                        type: 'dialogue_fake',
                        token: right_lines[ii + left_tokens].token,
                        text: '',
                        start: lines[left_index + left_tokens].start,
                        end: lines[left_index + left_tokens].end,
                    }));
                    insertLength--;
                    ii++;
                }
                lines.splice(left_index + left_tokens, 0, ...insertArray);
            }
        };

        while (any_unfolded_dual_dialogue_exists) {
            var left_index = get_first_unfolded_dual_left();
            var right_index = left_index === -1 ? -1 : get_first_unfolded_dual_right_index_from(left_index);
            any_unfolded_dual_dialogue_exists = left_index !== -1 && right_index !== -1;
            if (any_unfolded_dual_dialogue_exists) {
                fold_dual_dialogue(left_index, right_index);
            }
        }

    };



    line = async (tokens: any, cfg: any): Promise<any> => {

        var lines: any[] = [],
            global_index = 0;

        this._state = "normal";

        var after_section = false;
        var current_section_level = 0;

        var PDFDocument = require('pdfkit');
        var options = {
            compress: false,
            size: cfg.print.paper_size.indexOf("a4") >= 0 ? 'A4' : 'LETTER',
            margins: {
                top: 0,
                left: 0,
                bottom: 0,
                right: 0
            }
        };
        var doc = new PDFDocument(options);
        const fontFinder = require('font-finder');
        var variants = await fontFinder.listVariants(cfg.font);
        var sett = false;
        variants.forEach((variant: any) => {
            if (variant.style == "regular") {
                doc.registerFont(cfg.font, variant.path);
                sett = true;
            }
        });
        if (!sett && variants.length > 0) {
            doc.registerFont(cfg.font, variants[0].path);
            sett = true;
        }
        if (!sett) {
            var fp = __dirname.slice(0, __dirname.lastIndexOf(path.sep)) + path.sep + 'courierprime' + path.sep
            doc.registerFont(cfg.font, fp + 'courier-prime.ttf');
        }
        doc.font(cfg.font);
        doc.fontSize(cfg.print.font_size);

        var lastLineBlank = false;

        tokens.forEach((token: any) => {
            if (!token.hide) {
                // var max = (cfg.print[token.type] || {}).max || cfg.print.action.max;

                var feed = (cfg.print[token.type] || {}).feed || 0
                if (token.type == "synopsis") {
                    if (after_section && cfg.print.synopsis.feed_with_last_section) {
                        feed += current_section_level * cfg.print.section.level_indent
                    } else {
                        feed = cfg.print.action.feed
                    }
                    feed += cfg.print.synopsis.padding || 0;
                }

                //Replace tabs with 4 spaces
                if (token.text) {
                    token.text = token.text.replace('\t', '    ');
                }

                // if (token.dual) {
                //     max *= cfg.print.dual_max_factor;
                // }

                // TODO Arming (2024-09-04) : note  [[ ]] 标签可能会被换行，导致 pdf 打印时判断 note [[]] 必须单行才能 按照预期打印会出问题
                // pdf 打印 note [[ ]] 特殊处理。将其转换为 ↺↻
                // this.split_token(token, max);

                // var w = 72 * (cfg.print.page_width - cfg.print.left_margin - cfg.print.right_margin) * max / cfg.print.max;
                var w = 72 * (cfg.print.page_width - feed - feed);
                if (token.dual) {
                    // w = (w / 2) + (72 * (cfg.print.right_margin));
                    // w = (w / 2) ;
                    var feed_diff = 0.2
                    if (token.type == "parenthetical") {
                        w = (cfg.print.page_width / 2 - cfg.print.action.feed - (feed_diff * 3)) * 72;
                    }
                    else if (token.type == "character" || token.type == "more") {
                        w = (cfg.print.page_width / 2 - cfg.print.action.feed - (feed_diff * 5)) * 72;
                    }
                    else {
                        w = (cfg.print.page_width / 2 - cfg.print.action.feed - feed_diff) * 72;
                    }
                }

                // var w = 72 * (cfg.print.page_width - cfg.print.left_margin - cfg.print.right_margin);
                this.split_token2(token, w, cfg.font, cfg.print.font_size, doc, charOfStyleTag.all);

                if (token.is("scene_heading") && lines.length) {
                    token.lines[0].number = token.number;
                }

                token.lines.forEach((line: any, index: any) => {
                    var pushed = true;
                    if (cfg.merge_empty_lines) {

                        if (token.type === "page_break") {
                            lastLineBlank = false; // 需要保留行
                        } else {
                            var currBlank = isBlankLineAfterStlyle(line.text);
                            if (currBlank && lastLineBlank) {
                                var t = line.text.replace(/\s/g, '').trim(); // 剩下样式符号
                                // 加到上一行
                                lines[lines.length - 1].text += t;
                                pushed = false;
                            }
                            lastLineBlank = currBlank;
                        }
                    }
                    if (pushed) {
                        line.local_index = index;
                        line.global_index = global_index++;
                        lines.push(line);
                    }
                });

                if (token.type === 'section') {
                    after_section = true;
                    current_section_level = token.level;
                } else if (token.type === 'scene_heading') {
                    after_section = false;
                }
            }
        });

        this.fold_dual_dialogue(lines);
        lines = this.break_lines(lines, cfg.print.lines_per_page, cfg.lines_breaker || this.default_breaker, cfg);//删除每页开始的空行，以及断页行

        return lines;
    };
}