import { calculateDialogueDuration, trimCharacterExtension, last, trimCharacterForceSymbol, parseLocationInformation, slugify, calculateActionDuration } from "./utils";
import { token, create_token } from "./token";
import { Range, Position } from "vscode";
import { getFountainConfig } from "./configloader";
import * as vscode from 'vscode';
import { AddDialogueNumberDecoration } from "./providers/Decorations";
import helpers from "./helpers";
import { blockRegex, charOfStyleTag, tokenRegex } from "./cons";

declare global {
    interface Array<T> {
        pushSorted(el: any, compareFn: Function): number
    }
}
Array.prototype.pushSorted = function (el, compareFn) {
    this.splice((function (arr) {
        var m = 0;
        var n = arr.length - 1;

        while (m <= n) {
            var k = (n + m) >> 1;
            var cmp = compareFn(el, arr[k]);

            if (cmp > 0) m = k + 1;
            else if (cmp < 0) n = k - 1;
            else return k;
        }

        return -m - 1;
    })(this), 0, el);

    return this.length;
};

//Unicode uppercase letters:
export const regex: { [index: string]: RegExp } = {
    title_page: /^(title|credit|author[s]?|source|notes|draft date|date|watermark|contact( info)?|revision|copyright|font|font italic|font bold|font bold italic|tl|tc|tr|cc|br|bl|header|footer)\:.*/i,

    section: /^[ \t]*(#+)(?:\s*)(.*)/,
    synopsis: /^[ \t]*(?:\=(?!\=+)\s*)(.*)/,

    scene_heading: /^[ \t]*([.](?=[\w\(\p{L}])|(?:int|ext|est|int[.]?\/ext|i[.]?\/e)[. ])(.*?)(#\s*[^\s].*#)?\s*$/iu,
    scene_number: /#(.+)#/,

    // transition: /^[ \t]*((?:FADE (?:TO BLACK|OUT)|CUT TO BLACK)\.|.+ TO\:|^TO\:$)|^(?:> *)(.+)/,
    transition: /^\s*(?:(>)[^<\n\r]*|[A-Z ]+TO:)$/,

    dialogue: /^[ \t]*([*_]+[^\p{Ll}\p{Lo}\p{So}\r\n]*)(\^?)?(?:\n(?!\n+))([\s\S]+)/u,

    character: blockRegex.block_dialogue_begin,
    parenthetical: /^[ \t]*(\(.+\))\s*$/,
    parenthetical_start: /^[ \t]*\([^\)]*$/,
    parenthetical_end: /^.*\)\s*$/,

    action: /^(.+)/g,
    centered: /(?<=^[ \t]*>\s*)(.+)(?=\s*<\s*$)/g,

    page_break: /^\s*\={3,}$/,
    line_break: /^ {2,}$/,

    note_inline: /(?:\[{2}(?!\[+))([\s\S]+?)(?:\]{2})/g,

    emphasis: /(_|\*{1,3}|_\*{1,3}|\*{1,3}_)(.+)(_|\*{1,3}|_\*{1,3}|\*{1,3}_)/g,
    bold_italic_underline: /(_{1}\*{3}(?=.+\*{3}_{1})|\*{3}_{1}(?=.+_{1}\*{3}))(.+?)(\*{3}_{1}|_{1}\*{3})/g,
    bold_underline: /(_{1}\*{2}(?=.+\*{2}_{1})|\*{2}_{1}(?=.+_{1}\*{2}))(.+?)(\*{2}_{1}|_{1}\*{2})/g,
    italic_underline: /(?:_{1}\*{1}(?=.+\*{1}_{1})|\*{1}_{1}(?=.+_{1}\*{1}))(.+?)(\*{1}_{1}|_{1}\*{1})/g,
    bold_italic: /(\*{3}(?=.+\*{3}))(.+?)(\*{3})/g,
    bold: /(\*{2}(?=.+\*{2}))(.+?)(\*{2})/g,
    italic: /(\*{1}(?=.+\*{1}))(.+?)(\*{1})/g,
    link: /(\[?(\[)([^\]\[]*\[?[^\]\[]*\]?[^\]\[]*)(\])(\()(.+?)(?:\s+(["'])(.*?)\4)?(\)))/g,
    // image: /(!\[?(\[)([^\]\[]*\[?[^\]\[]*[^\]\[]*)(\])(\()(.+?)(?:\s+(["'])(.*?)\4)?(\)))/g,
    lyric: blockRegex.lyric,
    underline: /(_{1}(?=.+_{1}))(.+?)(_{1})/g,
};
export interface titleKeywordFormat {
    position: 'cc' | 'br' | 'bl' | 'tr' | 'tc' | 'tl' | 'cc' | 'hidden',
    index: number
}

export const titlePageDisplay: { [index: string]: titleKeywordFormat } = {
    title: { position: 'cc', index: 0 },
    credit: { position: 'cc', index: 1 },
    author: { position: 'cc', index: 2 },
    authors: { position: 'cc', index: 3 },
    source: { position: 'cc', index: 4 },

    watermark: { position: 'hidden', index: -1 },
    font: { position: 'hidden', index: -1 },
    font_italic: { position: 'hidden', index: -1 },
    font_bold: { position: 'hidden', index: -1 },
    font_bold_italic: { position: 'hidden', index: -1 },
    header: { position: 'hidden', index: -1 },
    footer: { position: 'hidden', index: -1 },

    notes: { position: 'bl', index: 0 },
    copyright: { position: 'bl', index: 1 },

    revision: { position: 'br', index: 0 },
    date: { position: 'br', index: 1 },
    draft_date: { position: 'br', index: 2 },
    contact: { position: 'br', index: 3 },
    contact_info: { position: 'br', index: 4 },


    br: { position: 'br', index: -1 },
    bl: { position: 'bl', index: -1 },
    tr: { position: 'tr', index: -1 },
    tc: { position: 'tc', index: -1 },
    tl: { position: 'tl', index: -1 },
    cc: { position: 'cc', index: -1 }
}

interface LexerReplacements {
    [key: string]: string,
    //image: string,
    link: string,
    note: string,
    line_break: string,
    bold_italic_underline: string,
    bold_underline: string,
    italic_underline: string,
    bold_italic: string,
    bold: string,
    italic: string,
    underline: string
}

var htmlreplacements: LexerReplacements = {
    //image: '<img alt="$3" title="$3" src="$6">',
    link: '<a href=\"$6\">$3</a>',
    note: '<span class=\"note\">$1</span>',

    line_break: '<br />',

    bold_italic_underline: '<span class=\"bold italic underline\">$2</span>',
    bold_underline: '<span class=\"bold underline\">$2</span>',
    italic_underline: '<span class=\"italic underline\">$2</span>',
    bold_italic: '<span class=\"bold italic\">$2</span>',
    bold: '<span class=\"bold\">$2</span>',
    italic: '<span class=\"italic\">$2</span>',
    italic_global: '<span class=\"italic\">$2</span>',
    underline: '<span class=\"underline\">$2</span>',
};
export function lexer(s: string, type: string, replacer: LexerReplacements, titlepage: boolean = false) {
    if (!s) {
        return s;
    }

    var styles = ['underline', 'italic', 'bold', 'bold_italic', 'italic_underline', 'bold_underline', 'bold_italic_underline', 'italic_global']
        , i = styles.length, style, match;

    if (titlepage) {
        s = s.replace(regex.link, replacer.link);
    }
    s = s.replace(tokenRegex.note_inline, replacer.note).replace(/\n/g, replacer.line_break);

    // if (regex.emphasis.test(s)) {                         // this was causing only every other occurence of an emphasis syntax to be parsed
    while (i--) {
        style = styles[i];
        match = tokenRegex[style];

        if (match.test(s)) {
            s = s.replace(match, replacer[style]);
        }
    }
    // }
    // s = s.replace(/\[star\]/g, '*').replace(/\[underline\]/g, '_');
    if (type != "action")
        s = s.trim();
    return s;
}
export class Location {
    scene_number: number;
    name: string;
    interior: boolean;
    exterior: boolean;
    time_of_day: string;
    line: number;
}
export class StructToken {
    text: string;
    isnote: boolean;
    id: any;
    children: any; //Children of the section
    range: Range; //Range of the scene/section header
    level: number;
    section: boolean; // true->section, false->scene
    synopses: { synopsis: string; line: number }[];
    notes: { note: string; line: number }[];
    isscene: boolean;
    ischartor: boolean;
    dialogueEndLine: number;
    durationSec: number;
}
export class screenplayProperties {
    scenes: { scene: string; text: string, line: number, actionLength: number, dialogueLength: number }[];
    sceneLines: number[];
    sceneNames: string[];
    titleKeys: string[];
    firstTokenLine: number;
    fontLine: number;
    lengthAction: number; //Length of the action character count
    lengthDialogue: number; //Length of the dialogue character count
    characters: Map<string, number[]>;
    locations: Map<string, Location[]>;
    structure: StructToken[];
}
export interface parseoutput {
    scriptHtml: string,
    titleHtml: string,
    title_page: { [index: string]: token[] },
    tokens: token[],
    tokenLines: { [line: number]: number }
    lengthAction: number,
    lengthDialogue: number,
    parseTime: number,
    properties: screenplayProperties
}
export var parse = function (original_script: string, cfg: any, generate_html: boolean): parseoutput {
    var block_inner = false;
    // var block_dialogue = false;
    // var block_except_dialogue = false;

    var lastFountainEditor: vscode.Uri;
    var config = getFountainConfig(lastFountainEditor);
    var emptytitlepage = true;
    var lastScenStructureToken: StructToken;
    var lastChartorStructureToken: StructToken;
    var script = original_script,
        result: parseoutput = {
            title_page: {
                tl: [],
                tc: [],
                tr: [],
                cc: [],
                bl: [],
                br: [],
                hidden: []
            },
            tokens: [],
            scriptHtml: "",
            titleHtml: "",
            lengthAction: 0,
            lengthDialogue: 0,
            tokenLines: {},
            parseTime: +new Date(),
            properties:
            {
                sceneLines: [],
                scenes: [],
                sceneNames: [],
                titleKeys: [],
                firstTokenLine: Infinity,
                fontLine: -1,
                lengthAction: 0,
                lengthDialogue: 0,
                characters: new Map<string, number[]>(),
                locations: new Map<string, Location[]>(),
                structure: []
            }
        };
    if (!script) {
        return result;
    }

    var new_line_length = script.match(/\r\n/) ? 2 : 1;



    var lines = script.split(/\r\n|\r|\n/);
    var pushToken = function (token: token) {
        result.tokens.push(token);
        if (thistoken.line)
            result.tokenLines[thistoken.line] = result.tokens.length - 1;
    }

    var lines_length = lines.length,
        current_cursor = 0,
        // current_line_number = 0,
        scene_number = 1,
        current_depth = 0,
        match, text, last_title_page_token,
        thistoken: token,
        last_was_separator = false,
        //top_or_separated = false,
        // token_category = "none",
        last_character_index,
        // dual_right,
        dual_str = "",
        force_not_dual = true, //新场景中的第一个对话，强制为 非双对话
        state = "normal", // TODO Arming (2024-09-06) : 只有 对话 和 非对话（noremal），title page 3种之分
        previousCharacter,
        // cache_state_for_comment,
        nested_comments = 0,
        nested_notes = 0,
        title_page_complete = false,
        title_page_started = false,
        parenthetical_open = false,
        needProcessInlineNote = 0,
        current_expet_note_text = "", // 除去 note 之外的文字，用来计算时长。 当 current_has_note = true 才有值。
        current_outline_note_text: string[] = [] // 除去 note 首开口文字，用来 outline 面板提示。 当 needProcessInlineNote = true 才有值。


    var reduce_comment = function (prev: any, current: any) {
        if (current === "/*") {
            nested_comments++;
        } else if (current === "*/") {
            nested_comments--;
            if (nested_comments < 0) {
                nested_comments = 0;
                prev = prev + current;
            }
        } else if (nested_comments <= 0) {
            prev = prev + current;
        }
        return prev;
    };

    var reduce_note = function (prev: any, current: any) {
        if (current === "[[") {
            nested_notes++;
            if (nested_notes === 1) {
                // TODO Arming (2024-09-05) : 首行 note ，outline面板处理
                needProcessInlineNote++;
                if (cfg.print_notes) {
                    prev = prev + charOfStyleTag.note_begin + '['; // 首开口，转换成特殊样式字符。
                }
            } else {
                if (cfg.print_notes) {
                    prev = prev + '[';  // 嵌套的里层开口
                }
            }
        } else if (current === "]]") {
            nested_notes--;
            if (nested_notes < 0) {
                // 假注解，直接以 end 开始，直接显示 ]]
                nested_notes = 0;
                prev = prev + current;
            } else if (nested_notes === 0) {
                if (cfg.print_notes) {
                    prev = prev + ']' + charOfStyleTag.note_end; // 闭口，转换成特殊样式字符。
                }
            } else {
                if (cfg.print_notes) {
                    prev = prev + ']'; // 嵌套的里层闭口，
                }
            }
        } else if (nested_notes <= 0) {
            // 非注解的文字部分
            prev = prev + current;
            current_expet_note_text += current;
        } else {
            // 注解的文字部分
            if (cfg.print_notes) {
                prev = prev + current;
            }
            if (needProcessInlineNote > 0) {
                if (current_outline_note_text.length < needProcessInlineNote) {
                    if (current) {
                        current_outline_note_text.push(current);
                    } else {
                        current_outline_note_text.push("");
                    }
                }
            }
        }
        return prev;
    };

    var if_not_empty = function (a: any) {
        return a;
    };

    var lengthActionSoFar = 0; //total action length until the previous scene header
    var lengthDialogueSoFar = 0; //total dialogue length until the previous scene header

    var takeCount = 1; //total number of takes

    function updatePreviousSceneLength() {
        var action = result.lengthAction - lengthActionSoFar;
        var dialogue = result.lengthDialogue - lengthDialogueSoFar;
        lengthActionSoFar = result.lengthAction;
        lengthDialogueSoFar = result.lengthDialogue;

        if (result.properties.scenes.length > 0) {
            result.properties.scenes[result.properties.scenes.length - 1].actionLength = action;
            result.properties.scenes[result.properties.scenes.length - 1].dialogueLength = dialogue;
        }
    }

    const latestSectionOrScene = (depth: number, condition: (token: StructToken) => boolean): StructToken => {
        try {
            if (depth <= 0) {
                return null;
            }
            else if (depth == 1) {
                var lastItem: StructToken = last(result.properties.structure.filter(condition));
                return lastItem;
            }
            else {
                var prevSection = latestSectionOrScene(depth - 1, condition)
                if (prevSection.children != null && !prevSection.isscene) {
                    var lastChild = last(prevSection.children.filter(condition))
                    if (lastChild) return lastChild
                }
                // nest ###xyz inside #abc if there's no ##ijk to nest within
                return prevSection;
            }
        }
        catch {
            var section: StructToken = null;
            while (!section && depth > 0) section = latestSectionOrScene(--depth, condition);
            return section;
        }
    }

    const processInlineNotes2 = (linenumber: number) => {

        if (current_outline_note_text.length > 0) {
            var level = latestSectionOrScene(current_depth + 1, () => true);
            if (level) {
                level.notes = level.notes || []
                for (let i = 0; i < current_outline_note_text.length; i++) {
                    if (current_outline_note_text[i]) {
                        level.notes.push({ note: current_outline_note_text[i], line: linenumber });
                    }
                }
            }
            else {
                for (let i = 0; i < current_outline_note_text.length; i++) {
                    if (current_outline_note_text[i]) {
                        result.properties.structure.push({ text: current_outline_note_text[i], id: '/' + linenumber, isnote: true, isscene: false, ischartor: false, dialogueEndLine: 0, durationSec: 0, children: [], level: 0, notes: [], range: new Range(new Position(linenumber, 0), new Position(linenumber, current_outline_note_text[i].length + 4)), section: false, synopses: [] })
                    }
                }
            }
        }
    }

    // const processInlineNote = (text: string, linenumber: number): number => {
    //     let irrelevantTextLength = 0;
    //     if (match = text.match(new RegExp(regex.note_inline))) {
    //         var level = latestSectionOrScene(current_depth + 1, () => true);
    //         if (level) {
    //             level.notes = level.notes || []
    //             for (let i = 0; i < match.length; i++) {
    //                 match[i] = match[i].slice(2, match[i].length - 2);
    //                 level.notes.push({ note: match[i], line: thistoken.line });
    //                 irrelevantTextLength += match[i].length + 4;
    //             }
    //         }
    //         else {
    //             for (let i = 0; i < match.length; i++) {
    //                 match[i] = match[i].slice(2, match[i].length - 2);
    //                 result.properties.structure.push({ text: match[i], id: '/' + linenumber, isnote: true, isscene: false, ischartor: false, dialogueEndLine: 0, durationSec: 0, children: [], level: 0, notes: [], range: new Range(new Position(linenumber, 0), new Position(linenumber, match[i].length + 4)), section: false, synopses: [] })
    //                 irrelevantTextLength += match[i].length + 4;
    //             }
    //         }
    //     }
    //     return irrelevantTextLength;
    // }
    const processTokenTextStyleChar = (token: token) => {
        if (token.text) {
            // token.text = token.text.replace(/(?<!\\)_\*{3}/g, charOfStyleTag.bold_italic_underline);
            // token.text = token.text.replace(/(?<!\\)_\*{2}(?!\*)/g, charOfStyleTag.bold_underline);
            // token.text = token.text.replace(/(?<!\\)_\*(?!\*)/g, charOfStyleTag.italic_underline);
            token.text = token.text.replace(/(?<!\\)\*{3}/g, charOfStyleTag.bold_italic); // 三 *** 换成当个特殊符号 ，以防下面split_token分行截断。
            token.text = token.text.replace(/(?<!\\)\*{2}(?!\*)/g, charOfStyleTag.bold); // 双 ** 换成当个特殊符号 ↭ ，以防下面split_token分行截断。
            token.text = token.text.replace(/(?<!\\)\*(?!\*)/g, charOfStyleTag.italic);
            token.text = token.text.replace(/(?<!\\)_/g, charOfStyleTag.underline);
            token.text = token.text.replace(/\\\*/g, '*');
            token.text = token.text.replace(/\\_/g, '_');
            // var mt=token.text.split(regex.note_inline)
            // if (mt.length >) {
            //     let i = token.text.indexOf('[[');
            //     token.text = token.text.slice(0, i) + '↺' + token.text.slice(i + 2);
            //     i = token.text.indexOf(']]');
            //     token.text = token.text.slice(0, i) + '↻' + token.text.slice(i + 2);
            // } // 假的 note ，比如只有半边 [[ ，让其保留
        }
        return token.text
    }
    const processDialogueBlock = (token: token) => {
        // let textWithoutNotes = token.text.replace(regex.note_inline, "");
        // processInlineNote(token.text, token.line);
        let textWithoutNotes = "";
        if (current_has_note) {
            textWithoutNotes = current_expet_note_text;
        } else {
            textWithoutNotes = token.text;
        }
        token.time = calculateDialogueDuration(textWithoutNotes);
        // if (!cfg.print_notes) {
        //     token.text = textWithoutNotes;
        //     if (token.text.trim().length == 0) token.ignore = true;
        // }
        result.lengthDialogue += token.time;
        if (lastScenStructureToken) {
            lastScenStructureToken.durationSec = lastScenStructureToken.durationSec ? lastScenStructureToken.durationSec + token.time : token.time;
        }
        if (lastChartorStructureToken) {
            lastChartorStructureToken.durationSec = lastChartorStructureToken.durationSec ? lastChartorStructureToken.durationSec + token.time : token.time;
        }
    }
    // const processParentheticalBlock = (token: token) => {
    //     let textWithoutNotes = token.text.replace(regex.note_inline, "");
    //     processInlineNote(token.text, token.line);
    //     if (!cfg.print_notes) {
    //         token.text = textWithoutNotes;
    //         if (token.text.trim().length == 0) token.ignore = true;
    //     }
    // }
    const processActionBlock = (token: token) => {
        // processInlineNote(token.text, token.line);
        // token.time = calculateActionDuration(token.text.length - irrelevantActionLength);
        let textWithoutNotes = "";
        if (current_has_note) {
            textWithoutNotes = current_expet_note_text;
        } else {
            textWithoutNotes = token.text;
        }
        token.time = calculateActionDuration(textWithoutNotes);
        // if (!cfg.print_notes) {
        //     token.text = token.text.replace(regex.note_inline, "");
        //     if (token.text.trim().length == 0) token.ignore = true;
        // }
        result.lengthAction += token.time;
        if (lastScenStructureToken) {
            lastScenStructureToken.durationSec = lastScenStructureToken.durationSec ? lastScenStructureToken.durationSec + token.time : token.time;
        }
    }
    var block_start_type = ''; // "dialogue" | "title" | "action" | "scene" | "transitions" 
    let ignoredLastToken = false;
    for (var i = 0; i < lines_length; i++) {
        // var is_character_line = false;
        needProcessInlineNote = 0;
        var current_has_note = false // 当前行，是否包含 note
        current_expet_note_text = "" // 除去 note 之外的文字，用来计算时长。 当 current_has_note = true 才有值。
        current_outline_note_text = []
        // current_line_number = i;
        text = lines[i];
        block_start_type = ''; // 是否 block 首行

        var beforEmpty = text.trim().length === 0;
        var match_block_end_empty_line = false;
        var match_line_break = false;

        if (beforEmpty) {
            match_block_end_empty_line = true;
            if (text.length <= 1) {
                // match_block_end_empty_line = true;
            } else {
                match_line_break = true;
            }
        }


        // 1. 至少在 dialogue block 或 非dialog block 中了。

        // var noteBreakLine = false;
        var emptyBreakLine = false;
        var is_block_end_empty_line = false; // 连续块后紧接着的断块 空行。
        // var is_block_begin_line = false; // 连续块后紧接着的断块 空行。

        if (match_block_end_empty_line) {
            if (nested_comments > 0 || nested_notes > 0) {
                // 如果是在注释中，那么直接忽略
                current_has_note = true;
                if (nested_notes > 0 && cfg.print_notes && match_line_break) {
                    // noteBreakLine = true;
                    // note 空行，双空格表示保留一个空行，否则直接去掉空行。
                } else {
                    continue;
                }
            } else {
                if (!block_inner) {
                    // 至少一个空行后的，再空行。且不在 注解中的空行。
                    // 插入一个 action 空行
                    // continue;
                    emptyBreakLine = true;
                } else {
                    // 非空行后的紧接着的空行。
                    if(match_line_break && state != "normal") {
                        //区分情况，title page 和 dialogue 里面的 双空格空行，转成换行，还归为块内内容。
                    } else {
                        block_inner = false;
                        is_block_end_empty_line = true;
                        block_start_type = "";
                        if (title_page_started) {
                            title_page_complete = true;
                        }
                    }

                    // block_dialogue = false;
                    // block_except_dialogue = false;
                }
            }
        } else {
            if (!block_inner) {
                block_inner = true;
                // is_block_begin_line = true;
                if (nested_comments > 0 || nested_notes > 0) {

                } else {
                    // 非注解空行后的紧接着的 第一个非空行。
                    if (title_page_complete) {
                        if (text.match(regex.scene_heading)) {
                            block_start_type = "scene";
                        } else if (text.match(regex.transition)) {
                            block_start_type = "transitions";
                        } else if (text.match(blockRegex.action_force)) {
                            block_start_type = "action_force";
                            // block_dialogue = true;
                        } else if (text.match(regex.character)) {
                            block_start_type = "dialogue";
                        } else {
                            block_start_type = "action";
                            // block_except_dialogue = true;
                        }
                    } else {
                        if (!title_page_started) {
                            if (text.match(regex.title_page)) {
                                title_page_started = true;
                                block_start_type = "title";
                                state = "title_page";
                            } else if (text.match(regex.scene_heading) ) {
                                // 直接开始场景，忽略 title 页
                                block_start_type = "scene";
                                title_page_started = true;
                                title_page_complete = true;
                            } else if (text.match(regex.transition)) {
                                // 直接开始场景，忽略 title 页
                                block_start_type = "transitions";
                                title_page_started = true;
                                title_page_complete = true;
                            } else {
                                // titile 页开始前的 其他 内容，全部忽略
                                block_start_type = "invalid";
                                continue;
                            }
                        }
                    }
                }
            } else {
                if(!title_page_started) {
                    // titile 页开始前的 其他 内容，全部忽略
                    continue;
                }
            }


            // 2. 至少不是空行了。
            // comments 与 note 不相互嵌套，谁先 open 以谁为主
            var coommentsFisrt = false;
            var noteFisrt = false;
            if (nested_comments === 0 && nested_notes === 0) {
                var idxCm = text.indexOf("/*");
                var idxNt = text.indexOf("[[");
                coommentsFisrt = idxCm >= 0 && (idxNt < 0 || idxCm < idxNt);
                noteFisrt = idxNt >= 0 && (idxCm < 0 || idxNt < idxCm);
            } else if (nested_notes > 0) {
                noteFisrt = true;
            } else if (nested_comments > 0) {
                coommentsFisrt = true;
            }

            if (coommentsFisrt) {
                // replace inline comments
                var arr = text.split(/(\/\*){1}|(\*\/){1}/g)
                text = arr.filter(if_not_empty).reduce(reduce_comment, "");

                if (text.length === 0) {
                    // 跨行注解，整行都是注解。 只要剩一个空格，都当插入空行处理
                    continue;
                }
            } else if (noteFisrt) {
                // replace inline notes
                current_has_note = true;
                var arr = text.split(/(\[\[)|(\]\])/g)
                text = arr.filter(if_not_empty).reduce(reduce_note, "");

                if (needProcessInlineNote) {
                    // TODO Arming (2024-09-05) : 
                    processInlineNotes2(i)
                    needProcessInlineNote = 0;
                }

                if (text.length === 0) {
                    // 跨行注解，整行都是注解
                    // if (needProcessInlineNote == 0) {
                    continue;
                    // }
                }
            }
        }



        // if (nested_comments && state !== "ignore") {
        //     cache_state_for_comment = state;
        //     state = "ignore";
        // } else if (state === "ignore") {
        //     state = cache_state_for_comment;
        // }

        // if (nested_comments === 0 && state === "ignore") {
        //     state = cache_state_for_comment;
        // }


        thistoken = create_token(text, current_cursor, i, new_line_length);
        current_cursor = thistoken.end + 1;


        if (text.trim().length === 0) {
            // 1. noteBreakLine = true  需插入note空白换行
            // 2. is_block_end_empty_line = true  普通正常结束
            // 3. current_has_note = true 整行是注解，不插入空白换行，跳过。

            if (emptyBreakLine) {
                // 空行后的空行

                var skip_separator = (cfg.merge_multiple_empty_lines && last_was_separator) ||
                    (ignoredLastToken && result.tokens.length > 1 && result.tokens[result.tokens.length - 1].type == "separator");

                if (skip_separator) {
                    continue;
                }
                thistoken.type = "separator"; // TODO Arming (2024-09-05) : 对应就是 没有对话，也没有非对话块 的空行，对应 state = normal， 能产生pdf一条空行。
                pushToken(thistoken);
                last_was_separator = true;


            } else {
                if (is_block_end_empty_line) {
                    // 块的结束，处理 状态
                    if (state == "dialogue") {
                        if (lastChartorStructureToken) {
                            lastChartorStructureToken.dialogueEndLine = i - 1;
                        }
                        parenthetical_open = false;
                        pushToken(create_token(undefined, undefined, undefined, undefined, "dialogue_end")); // TODO Arming (2024-09-05) : 对话块后的 附加的 空白token 。不产生pdf实际空行，只是逻辑处理需要。
                    }
                    if (state == "dual_dialogue") {
                        if (lastChartorStructureToken) {
                            lastChartorStructureToken.dialogueEndLine = i - 1;
                        }
                        parenthetical_open = false;
                        pushToken(create_token(undefined, undefined, undefined, undefined, "dual_dialogue_end"));
                    }
                    dual_str = "";
                    state = "normal";

                    thistoken.type = "separator"; // TODO Arming (2024-09-05) : 对应就是 没有对话，也没有非对话块 的空行，对应 state = normal， 能产生pdf一条空行。
                    pushToken(thistoken);
                    last_was_separator = true;
                } else {
                    // note 里的延续空行 /或者 延续块内容的块内空行
                    if (result.tokens.length > 0) {
                        if (state === "title_page") {
                            // result.tokens[result.tokens.length - 1].text += "\n";
                            last_title_page_token.text += "\n";
                        } else {
                            thistoken.type = result.tokens[result.tokens.length - 1].type;
                            if (thistoken.type == "character") {
                                thistoken.type = "dialogue";
                            } else if (thistoken.type == "parenthetical") {
                                thistoken.type = "parenthetical";
                            } else if (thistoken.type == "dialogue") {
                                thistoken.type = "dialogue";
                            } else {
                                thistoken.type = "action";
                            }
                            pushToken(thistoken);
                        }
                        // TODO Arming (2024-09-06) : 纯note内容的行，只有 以下几种 token type
                        // 对话 dual_dialogue, dialogue ,parenthetical, action 分别对应不同宽度页面位置。
                        // title page 上的只能，不能生成独立token，只能追加到 token.text 上换行。
                        // title page 之前的纯 note的token会分配type为action，pdf显示位置会 重新排序后置到 page 页后面去。action type 的token都显示到title page 之后去，重排位置。
                    }
                }
            }
            continue;

        }

        //top_or_separated = last_was_separator || i === 0;
        // token_category = "script";

        // if (!title_page_started && regex.title_page.test(thistoken.text)) {
        //     state = "title_page";
        // }

        if (state === "title_page") {
            if (thistoken.text.match(regex.title_page)) {
                var index = thistoken.text.indexOf(":");
                thistoken.type = thistoken.text.substr(0, index).toLowerCase().replace(" ", "_");
                thistoken.text = thistoken.text.substr(index + 1).trim();
                processTokenTextStyleChar(thistoken);

                last_title_page_token = thistoken;
                let keyformat = titlePageDisplay[thistoken.type];
                if (result.properties.titleKeys.indexOf(thistoken.type) == -1) {
                    result.properties.titleKeys.push(thistoken.type);
                }
                if (keyformat) {
                    thistoken.index = keyformat.index;
                    result.title_page[keyformat.position].push(thistoken);
                    emptytitlepage = false;
                }
                title_page_started = true;
                // continue;
            } else {
                // 标题页 字段内容的换行 内容。
                processTokenTextStyleChar(thistoken);
                last_title_page_token.text += (last_title_page_token.text ? "\n" : "") + thistoken.text.trim();
            }
            continue;
        }

        const latestSection = (depth: number): StructToken => latestSectionOrScene(depth, token => token.section)
        // const latestScene = (): StructToken => latestSectionOrScene(1, token => token.isscene)



        if (state === "normal") {
            // todo: block首行定位性质 ， 或者 非对话 block 的后续行
            // if (thistoken.text.match(regex.line_break)) {
            //     token_category = "none"; // TODO Arming (2024-09-06) : 只有 "script" 和 “none”； none 会导致 不 push token，相当于忽略这一行的内容
            // } else 
            if (result.properties.firstTokenLine == Infinity) {
                result.properties.firstTokenLine = thistoken.line;
            }

            // 对话首行需放在最前
            if (block_start_type == "dialogue" ) {
                // The last part of the above statement ('(lines[i + 1].trim().length == 0) ? (lines[i+1] == "  ") : false)')
                // means that if the trimmed length of the following line (i+1) is equal to zero, the statement will only return 'true',
                // and therefore consider the token as a character, if the content of the line is exactly two spaces.
                // If the trimmed length is larger than zero, then it will be accepted as dialogue regardless
                state = "dialogue";
                thistoken.type = "character";
                thistoken.takeNumber = takeCount++;
                if (config.print_dialogue_numbers) AddDialogueNumberDecoration(thistoken)
                thistoken.text = trimCharacterForceSymbol(thistoken.text);
                if (thistoken.text[thistoken.text.length - 1] === "^") {
                    if (cfg.use_dual_dialogue && !force_not_dual) {
                        state = "dual_dialogue"
                        // update last dialogue to be dual:left
                        var dialogue_tokens = ["dialogue", "character", "parenthetical"];
                        var mod_last = false;
                        while (dialogue_tokens.indexOf(result.tokens[last_character_index].type) !== -1) {
                            var old_last_dual = result.tokens[last_character_index].dual;
                            if (!old_last_dual) {
                                mod_last = true;
                                result.tokens[last_character_index].dual = "left";
                                dual_str = "right";
                            } else if (old_last_dual === "left") {
                                dual_str = "right";
                            } else {
                                dual_str = "left";
                            }
                            last_character_index++;
                        }

                        if (mod_last) {
                            //update last dialogue_begin to be dual_dialogue_begin and remove last dialogue_end
                            var foundmatch = false;
                            var temp_index = result.tokens.length;
                            temp_index = temp_index - 1;
                            while (!foundmatch) {
                                temp_index--;
                                switch (result.tokens[temp_index].type) {
                                    case "dialogue_end":
                                        result.tokens.splice(temp_index);
                                        temp_index--;
                                        break;
                                    case "separator": break;
                                    case "character": break;
                                    case "dialogue": break;
                                    case "parenthetical": break;
                                    case "dialogue_begin":
                                        result.tokens[temp_index].type = "dual_dialogue_begin";
                                        foundmatch = true;
                                        break;
                                    default: foundmatch = true;
                                }
                            }
                        }
                        if (dual_str === "left") {
                            pushToken(create_token(undefined, undefined, undefined, undefined, "dual_dialogue_begin"));
                        } else {
                            // 删除之前 left 的 dual_dialogue_end
                            var foundmatch = false;
                            var temp_index = result.tokens.length;
                            temp_index = temp_index - 1;
                            while (!foundmatch) {
                                temp_index--;
                                switch (result.tokens[temp_index].type) {
                                    case "dual_dialogue_end":
                                        result.tokens.splice(temp_index);
                                        temp_index--;
                                        break;
                                    case "separator": break;
                                    case "character": break;
                                    case "dialogue": break;
                                    case "parenthetical": break;
                                    // case "dialogue_begin":
                                    //     result.tokens[temp_index].type = "dual_dialogue_begin";
                                    //     foundmatch = true;
                                    //     break;
                                    default: foundmatch = true;
                                }
                            }
                        }

                        // dual_right = true;
                        thistoken.dual = dual_str;
                    }
                    else {
                        pushToken(create_token(undefined, undefined, undefined, undefined, "dialogue_begin"));
                    }
                    thistoken.text = thistoken.text.replace(/\^\s*$/, "");
                }
                else {
                    pushToken(create_token(undefined, undefined, undefined, undefined, "dialogue_begin")); // TODO Arming (2024-09-05) : 在 角色 line 后插入一个附加的 空token，type = dialogue_begin。 不产生pdf实际空行，只是逻辑处理需要。
                }
                force_not_dual = false;
                let character = trimCharacterExtension(thistoken.text).trim();
                previousCharacter = character;
                if (result.properties.characters.has(character)) {
                    var values = result.properties.characters.get(character);
                    if (values.indexOf(scene_number) == -1) {
                        values.push(scene_number);
                    }
                    result.properties.characters.set(character, values);
                }
                else {
                    result.properties.characters.set(character, [scene_number]);
                }
                last_character_index = result.tokens.length;

                // todo 对话角色加入结构树
                if (lastScenStructureToken) {
                    if (config.dialogue_foldable) {
                        let cobj: StructToken = new StructToken();
                        cobj.text = thistoken.text;
                        cobj.children = null;
                        cobj.range = new Range(new Position(thistoken.line, 0), new Position(thistoken.line, thistoken.text.length));
                        cobj.id = lastScenStructureToken.id + '/' + thistoken.line;
                        cobj.ischartor = true;
                        cobj.dialogueEndLine = lines_length - 1;
                        lastScenStructureToken.children.push(cobj);
                        lastChartorStructureToken = cobj;
                    }
                }



                // var level = latestScene();
                // if(level){
                //     cobj.id = level.id + '/' + thistoken.line;
                //     // level.children.push(cobj);
                // }
                // else{
                //     cobj.id = '/' + thistoken.line;
                //     // result.properties.structure.push(cobj);
                // }
            } else if (block_start_type == "scene") {
                force_not_dual = true;
                thistoken.text = thistoken.text.replace(/^[ \t]*\./, "");
                if (cfg.each_scene_on_new_page && scene_number !== 1) {
                    var page_break = create_token();
                    page_break.type = "page_break";
                    page_break.start = thistoken.start;
                    page_break.end = thistoken.end;
                    pushToken(page_break); //第一个 scene 之前 ，制造一个 分页 token
                }
                thistoken.type = "scene_heading";
                thistoken.number = scene_number.toString();
                if (match = thistoken.text.match(regex.scene_number)) {
                    thistoken.text = thistoken.text.replace(regex.scene_number, "");
                    thistoken.number = match[1].trim();
                }
                let cobj: StructToken = new StructToken();
                cobj.text = thistoken.text;
                cobj.children = [];
                cobj.range = new Range(new Position(thistoken.line, 0), new Position(thistoken.line, thistoken.text.length));
                cobj.isscene = true;



                if (current_depth == 0) {
                    cobj.id = '/' + thistoken.line;
                    result.properties.structure.push(cobj);
                }
                else {
                    var level = latestSection(current_depth);
                    if (level) {
                        cobj.id = level.id + '/' + thistoken.line;
                        level.children.push(cobj);
                    }
                    else {
                        cobj.id = '/' + thistoken.line;
                        result.properties.structure.push(cobj);
                    }
                }
                lastScenStructureToken = cobj;

                updatePreviousSceneLength();
                result.properties.scenes.push({ scene: thistoken.number, text: thistoken.text, line: thistoken.line, actionLength: 0, dialogueLength: 0 })
                result.properties.sceneLines.push(thistoken.line);
                result.properties.sceneNames.push(thistoken.text);

                let sceneHeadingMatch = text.match(regex.scene_heading);
                const location = parseLocationInformation(sceneHeadingMatch);
                if (location) {
                    const locationSlug = slugify(location.name);
                    if (result.properties.locations.has(locationSlug)) {
                        const values = result.properties.locations.get(locationSlug);
                        if (values.findIndex(it => it.scene_number == scene_number) == -1) {
                            values.push({
                                scene_number: scene_number,
                                line: thistoken.line,
                                ...location
                            });
                        }
                        result.properties.locations.set(locationSlug, values);
                    }
                    else {
                        result.properties.locations.set(locationSlug, [{ scene_number, line: thistoken.line, ...location }]);
                    }
                }
                scene_number++;

            } else if (block_start_type == "action_force") {
                // 强制 转换 action
                thistoken.type = "action";
                var mt = thistoken.text.match(blockRegex.action_force);
                thistoken.text = mt[1] + mt[3]; // 保留空格格式
                processTokenTextStyleChar(thistoken);
                processActionBlock(thistoken); // 其他后续行，不转换！号
            } else if (thistoken.text.match(blockRegex.lyric)) {
                // 强制 转换 action 中 歌词
                thistoken.type = "action";
                var mt = thistoken.text.trimRight().match(blockRegex.lyric);
                var ct = mt[4];
                if (ct) {
                    ct = charOfStyleTag.italic_global_begin + ct + charOfStyleTag.italic_global_end;
                } // 加斜体样式. 保留空格格式
                thistoken.text = mt[1] + mt[3] + ct;
                processTokenTextStyleChar(thistoken);
                // processActionBlock(thistoken);
            } else if (thistoken.text.match(regex.centered)) {
                thistoken.type = "centered";
                var mt = thistoken.text.match(regex.centered);
                thistoken.text = mt[0];
                processTokenTextStyleChar(thistoken);
            } else if (block_start_type == "transitions") {
                thistoken.text = thistoken.text.replace(/^\s*>\s*/, "");
                thistoken.type = "transition";
            } else if (match = thistoken.text.match(regex.synopsis)) {
                thistoken.text = match[1];
                processTokenTextStyleChar(thistoken);
                thistoken.type = thistoken.text ? "synopsis" : "separator";

                var level = latestSectionOrScene(current_depth + 1, () => true);
                if (level) {
                    level.synopses = level.synopses || []
                    level.synopses.push({ synopsis: thistoken.text, line: thistoken.line })
                }
            } else if (match = thistoken.text.match(regex.section)) {
                thistoken.level = match[1].length;
                thistoken.text = match[2];
                thistoken.type = "section";
                let cobj: StructToken = new StructToken();
                cobj.text = thistoken.text;
                current_depth = thistoken.level;
                cobj.level = thistoken.level;
                cobj.children = [];
                cobj.range = new Range(new Position(thistoken.line, 0), new Position(thistoken.line, thistoken.text.length));
                cobj.section = true;

                const level = current_depth > 1 && latestSectionOrScene(current_depth, token => token.section && token.level < current_depth)
                if (current_depth == 1 || !level) {
                    cobj.id = '/' + thistoken.line;
                    result.properties.structure.push(cobj)
                }
                else {
                    cobj.id = level.id + '/' + thistoken.line;
                    level.children.push(cobj);
                }

            } else if (thistoken.text.match(regex.page_break)) {
                thistoken.text = "";
                thistoken.type = "page_break";
            } else {
                thistoken.type = "action"; // TODO Arming (2024-09-06) : 其他类型通通归于 action，
                processTokenTextStyleChar(thistoken);
                processActionBlock(thistoken);
            }
        } else {
            // todo 对话 block 的后续连续行
            thistoken.text = thistoken.text.trim();
            // if (cfg.emitalic_dialog) {
            //     if (!thistoken.text.endsWith('*') || !thistoken.text.startsWith('*')) {
            //         thistoken.text = '*' + thistoken.text + '*';
            //     }
            // } //根据配置，施加斜体样式，如果可以的话。
            // processTokenTextStyleChar(thistoken);
            if (parenthetical_open) {
                thistoken.type = "parenthetical";
                // processParentheticalBlock(thistoken);
                if (thistoken.text.match(regex.parenthetical_end)) {
                    parenthetical_open = false;
                }
            } else {
                if (thistoken.text.match(regex.parenthetical)) {
                    thistoken.type = "parenthetical";
                    // processParentheticalBlock(thistoken);
                } else if (thistoken.text.match(regex.parenthetical_start)) {
                    thistoken.type = "parenthetical";
                    // processParentheticalBlock(thistoken);
                    parenthetical_open = true;
                } else {
                    thistoken.type = "dialogue";
                    processDialogueBlock(thistoken);
                    thistoken.character = previousCharacter;
                }
            }
            if (dual_str) {
                thistoken.dual = dual_str;
            }
            processTokenTextStyleChar(thistoken);
            if (cfg.emitalic_dialog) {
                thistoken.text = charOfStyleTag.italic_global_begin + thistoken.text + charOfStyleTag.italic_global_end;
            } //根据配置，施加斜体样式，如果可以的话。
        }


        last_was_separator = false;

        if (state !== "ignore") {
            if (thistoken.is("scene_heading", "transition")) {
                thistoken.text = thistoken.text.toUpperCase();
            }
            // if (thistoken.text && thistoken.text[0] === "~") {
            //     thistoken.text = "*" + thistoken.text.substr(1) + "*";
            // }
            if (thistoken.type != "action" && thistoken.type != "dialogue")
                thistoken.text = thistoken.text.trim();

            // TODO Arming (2024-08-29) : 
            // if (thistoken.type === "character") {
            //     if (cfg.embolden_character_names) {
            //         if (thistoken.text.endsWith(cfg.text_contd)) {
            //             thistoken.text = thistoken.text.substring(0, thistoken.text.length - cfg.text_contd.length);
            //             thistoken.text = '**' + thistoken.text + '**' + cfg.text_contd;
            //         } else {
            //             thistoken.text = '**' + thistoken.text + '**';
            //         }
            //     }
            // } else
            // if (thistoken.type === "dialogue") {
            //     if (cfg.emitalic_dialog) {
            //         if (!thistoken.text.endsWith('*') || !thistoken.text.startsWith('*')) {
            //             thistoken.text = '*' + thistoken.text + '*';
            //         }
            //     }
            // }

            if (thistoken.ignore) {
                ignoredLastToken = true;
            }
            else {
                ignoredLastToken = false;
                pushToken(thistoken);
            }
        }

    }

    // TODO Arming (2024-09-05) : 所有文档行解析完后，如果是直接截断的对话block，额外添加 token dialogue_end。 逻辑处理需要，不实际产生pdf 空行。
    if (state == "dialogue") {
        pushToken(create_token(undefined, undefined, undefined, undefined, "dialogue_end"));
    }

    if (state == "dual_dialogue") {
        pushToken(create_token(undefined, undefined, undefined, undefined, "dual_dialogue_end"));
    }


    // tidy up separators

    if (generate_html) {
        var html = [];
        var titlehtml = [];
        var header = undefined;
        var footer = undefined;
        //Generate html for title page
        if (!emptytitlepage) {
            for (const section of Object.keys(result.title_page)) {
                result.title_page[section].sort(helpers.sort_index);
                titlehtml.push(`<div class="titlepagesection" data-position="${section}">`);
                let current_index = 0/*, previous_type = null*/;
                while (current_index < result.title_page[section].length) {
                    var current_token: token = result.title_page[section][current_index];
                    if (current_token.ignore) {
                        current_index++;
                        continue;
                    }
                    if (current_token.text != "") {
                        current_token.html = lexer(current_token.text, undefined, htmlreplacements, true);
                    }
                    switch (current_token.type) {
                        case 'title': titlehtml.push(`<h1 class="haseditorline titlepagetoken" id="sourceline_${current_token.line}">${current_token.html}</h1>`); break;
                        case 'header': header = current_token; break;
                        case 'footer': footer = current_token; break;
                        default: titlehtml.push(`<p class="${current_token.type} haseditorline titlepagetoken" id="sourceline_${current_token.line}">${current_token.html}</p>`); break;
                    }
                    current_index++;
                }
                titlehtml.push(`</div>`);
            }
        }
        if (header)
            html.push(`<div class="header" id="sourceline_${header.line}">${header.html}</div>`);
        else if (config.print_header)
            html.push(`<div class="header">${lexer(config.print_header, undefined, htmlreplacements, true)}</div>`);

        if (footer)
            html.push(`<div class="footer" id="sourceline_${footer.line}">${footer.html}</div>`);
        else if (config.print_footer)
            html.push(`<div class="footer">${lexer(config.print_footer, undefined, htmlreplacements, true)}</div>`);



        //Generate html for script
        let current_index = 0;
        var isaction = false;
        while (current_index < result.tokens.length) {
            var current_token: token = result.tokens[current_index];
            if (current_token.text != "") {
                current_token.html = lexer(current_token.text, current_token.type, htmlreplacements);
            } else {
                current_token.html = "";
            }

            if ((current_token.type == "action" || current_token.type == "centered") && !current_token.ignore) {
                let classes = "haseditorline";

                let elStart = "\n";
                if (!isaction) elStart = "<p>" //first action element
                if (current_token.type == "centered") {
                    if (isaction) elStart = ""; //It's centered anyway, no need to add anything
                    classes += " centered";
                }
                html.push(`${elStart}<span class="${classes}" id="sourceline_${current_token.line}">${current_token.html}</span>`);

                isaction = true;
            }
            else if (current_token.type == "separator" && isaction) {
                if (current_index + 1 < result.tokens.length - 1) {
                    //we're not at the end
                    var next_type = result.tokens[current_index + 1].type
                    if (next_type == "action" || next_type == "separator" || next_type == "centered") {
                        html.push("\n");
                    }
                }
                else if (isaction) {
                    //we're at the end
                    html.push("</p>")
                }
            }
            else {
                if (isaction) {
                    //no longer, close the paragraph
                    isaction = false;
                    html.push("</p>");
                }
                switch (current_token.type) {
                    case 'scene_heading':
                        var content = current_token.html;
                        if (cfg.embolden_scene_headers) {
                            content = '<span class=\"bold haseditorline\" id="sourceline_' + current_token.line + '">' + content + '</span>';
                        }

                        html.push('<h3 class="haseditorline" data-scenenumber=\"' + current_token.number + '\" data-position=\"' + current_token.line + '\" ' + (current_token.number ? ' id=\"sourceline_' + current_token.line + '">' : '>') + content + '</h3>');
                        break;
                    case 'transition': html.push('<h2 class="haseditorline" id="sourceline_' + current_token.line + '">' + current_token.text + '</h2>'); break;

                    case 'dual_dialogue_begin': html.push('<div class=\"dual-dialogue\">'); break;

                    case 'dialogue_begin': html.push('<div class=\"dialogue' + (current_token.dual ? ' ' + current_token.dual : '') + '\">'); break;

                    case 'character':
                        var content = current_token.html;
                        if (cfg.embolden_character_names) {
                            content = '<span class=\"bold haseditorline\" id="sourceline_' + current_token.line + '">' + content + '</span>';
                        }

                        if (current_token.dual == "left") {
                            html.push('<div class=\"dialogue left\">');
                        } else if (current_token.dual == "right") {
                            html.push('</div><div class=\"dialogue right\">');
                        }

                        if (config.print_dialogue_numbers) {
                            html.push('<h4 class="haseditorline" id="sourceline_' + current_token.line + '">' + current_token.takeNumber + ' – ' + content + '</h4>');
                        } else {
                            html.push('<h4 class="haseditorline" id="sourceline_' + current_token.line + '">' + content + '</h4>');
                        }

                        break;
                    case 'parenthetical': html.push('<p class="haseditorline parenthetical\" id="sourceline_' + current_token.line + '" >' + current_token.html + '</p>'); break;
                    case 'dialogue':
                        if (current_token.text == "  ")
                            html.push('<br>');
                        else
                            html.push('<p class="haseditorline" id="sourceline_' + current_token.line + '">' + current_token.html + '</p>');
                        break;
                    case 'dialogue_end': html.push('</div> '); break;
                    case 'dual_dialogue_end': html.push('</div></div> '); break;

                    case 'section': html.push('<p class="haseditorline section" id="sourceline_' + current_token.line + '" data-position=\"' + current_token.line + '\" data-depth=\"' + current_token.level + '\">' + current_token.text + '</p>'); break;
                    case 'synopsis': html.push('<p class="haseditorline synopsis" id="sourceline_' + current_token.line + '" >' + current_token.html + '</p>'); break;
                    case 'lyric': html.push('<p class="haseditorline lyric" id="sourceline_' + current_token.line + '">' + current_token.html + '</p>'); break;

                    case 'note': html.push('<p class="haseditorline note" id="sourceline_' + current_token.line + '">' + current_token.html + '</p>'); break;
                    case 'boneyard_begin': html.push('<!-- '); break;
                    case 'boneyard_end': html.push(' -->'); break;

                    case 'page_break': html.push('<hr />'); break;
                    /* case 'separator':
                         html.push('<br />');
                         break;*/
                }
            }

            //This has to be dealt with later, the tokens HAVE to stay, to keep track of the structure
            /*
            if (
                (!cfg.print_actions && current_token.is("action", "transition", "centered", "shot")) ||
                (!cfg.print_notes && current_token.type === "note") ||
                (!cfg.print_headers && current_token.type === "scene_heading") ||
                (!cfg.print_sections && current_token.type === "section") ||
                (!cfg.print_synopsis && current_token.type === "synopsis") ||
                (!cfg.print_dialogues && current_token.is_dialogue()) ||
                (cfg.merge_multiple_empty_lines && current_token.is("separator") && previous_type === "separator")) {

                result.tokens.splice(current_index, 1);
                continue;
            }
            */

            //previous_type = current_token.type;
            current_index++;
        }
        result.scriptHtml = html.join('');
        if (titlehtml && titlehtml.length > 0)
            result.titleHtml = titlehtml.join('');
        else
            result.titleHtml = undefined;
    }
    // clean separators at the end
    while (result.tokens.length > 0 && result.tokens[result.tokens.length - 1].type === "separator") {
        result.tokens.pop();
    }
    return result;
};
