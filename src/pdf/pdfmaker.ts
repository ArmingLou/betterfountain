// TODO: Extract pdfmaker to a separate library (+++++)

import * as fountainconfig from "../configloader";
import * as print from "./print";
import * as path from 'path';
import * as vscode from 'vscode';
import helpers from "../helpers";
import { isBlankLineAfterStlyle, openFile, revealFile, trimCharacterExtension, wordToColor } from "../utils";
import * as he from 'he';
import { addTextbox } from 'textbox-for-pdfkit';
import { regex } from "../afterwriting-parser";
import { Base64Encode } from "base64-stream";
import { charOfStyleTag } from "../cons";

// import * as blobUtil from "blob-util";
export class Options {
    filepath: string;
    config: fountainconfig.FountainConfig;
    parsed: any;
    print: print.PrintProfile;
    font: string;
    exportconfig: fountainconfig.ExportConfig;
    font_italic: string;
    font_bold: string;
    font_bold_italic: string;
    stash_style_right_clumn: StyleStash;
    stash_style_left_clumn: StyleStash;
    italic_global: boolean;
    italic_dynamic: boolean;
}

export class StyleStash {
    bold_italic: boolean;
    bold: boolean;
    italic: boolean;
    underline: boolean;
    override_color: string;
    italic_global: boolean;
    italic_dynamic: boolean;
}

var PDFDocument = require('pdfkit'),
    //helper = require('../helpers'),
    Blob = require('blob');

const textbox_width_error = 0;

var create_simplestream = function (filepath: string) {
    var simplestream: any = {
        chunks: [],
        filepath: filepath,
        on: function (event: any, callback: any) {
            console.log(event);
            this.callback = callback;
        },
        once: function () { },
        emit: function () { },
        write: function (chunk: any) {
            this.chunks.push(chunk);
        },
        end: function () {
            if (simplestream.filepath) {
                var fsmodule = 'fs';
                var fs = require(fsmodule); // bypass requirejs minification/optimization
                var stream = fs.createWriteStream(simplestream.filepath, {
                    encoding: "binary"
                });
                //stream.on('finish', this.callback());
                stream.on('error', function (err: any) {
                    if (err.code == "ENOENT") {
                        vscode.window.showErrorMessage("Unable to export PDF! The specified location does not exist: " + err.path)
                    }
                    else if (err.code == "EPERM") {
                        vscode.window.showErrorMessage("Unable to export PDF! You do not have the permission to write the specified file: " + err.path)
                    }
                    else {
                        vscode.window.showErrorMessage(err.message);
                    }
                    console.log(err);
                });
                stream.on('finish', () => {
                    let open = "Open";
                    let reveal = "Reveal in File Explorer";
                    if (process.platform == "darwin") reveal = "Reveal in Finder"
                    vscode.window.showInformationMessage("Exported PDF Succesfully!", open, reveal).then(val => {
                        switch (val) {
                            case open: {
                                openFile(simplestream.filepath);
                                break;
                            }
                            case reveal: {
                                revealFile(simplestream.filepath);
                                break;
                            }
                        }
                    })
                })

                stream.on('open', function () {
                    simplestream.chunks.forEach(function (buffer: any) {
                        stream.write(new Buffer(buffer.toString('base64'), 'base64'));
                    });
                    stream.end();
                });

            } else {
                simplestream.blob = new Blob(simplestream.chunks, {
                    type: "application/pdf"
                });
                // simplestream.url = blobUtil.createObjectURL(this.blob);
                this.callback(simplestream);
            }
        }
    };
    return simplestream;
};

async function initDoc(opts: Options) {
    var print = opts.print;
    //var fonts = opts.config.fonts || null;
    var options = {
        compress: false,
        size: print.paper_size.indexOf("a4") >= 0 ? 'A4' : 'LETTER',
        margins: {
            top: 0,
            left: 0,
            bottom: 0,
            right: 0
        }
    };
    var doc = new PDFDocument(options);

    /* if (opts.config.fonts) {
         doc.registerFont('ScriptNormal', fonts.normal.src, fonts.normal.family);
         doc.registerFont('ScriptBold', fonts.bold.src, fonts.bold.family);
         doc.registerFont('ScriptBoldOblique', fonts.bolditalic.src, fonts.bolditalic.family);
         doc.registerFont('ScriptOblique', fonts.italic.src, fonts.italic.family);
     }
     else {*/
    const fontFinder = require('font-finder');
    // TODO Arming (2024-08-29) : 
    //Load Courier Prime by default, and replace the variants if requested and available
    var fp = __dirname.slice(0, __dirname.lastIndexOf(path.sep)) + path.sep + 'courierprime' + path.sep
    doc.registerFont('ScriptNormal', fp + 'courier-prime.ttf');
    doc.registerFont('ScriptBold', fp + 'courier-prime-bold.ttf');
    doc.registerFont('ScriptBoldOblique', fp + 'courier-prime-bold-italic.ttf');
    doc.registerFont('ScriptOblique', fp + 'courier-prime-italic.ttf');
    if (opts.font != "Courier Prime") {
        var variants = await fontFinder.listVariants(opts.font);
        var initedMap = new Map<string, number>();
        var weightPathMap = new Map<number, string>();
        var pat = '';
        variants.forEach((variant: any) => {
            switch (variant.style) {
                case "regular":
                    doc.registerFont('ScriptNormal', variant.path);
                    pat = variant.path;
                    initedMap.set('ScriptNormal', variant.weight);
                    weightPathMap.set(variant.weight, variant.path);
                    break;
                case "bold":
                    doc.registerFont('ScriptBold', variant.path);
                    initedMap.set('ScriptBold', variant.weight);
                    weightPathMap.set(variant.weight, variant.path);
                    break;
                case "italic":
                    doc.registerFont('ScriptOblique', variant.path);
                    initedMap.set('ScriptOblique', variant.weight);
                    weightPathMap.set(variant.weight, variant.path);
                    break;
                case "boldItalic":
                    doc.registerFont('ScriptBoldOblique', variant.path);
                    initedMap.set('ScriptBoldOblique', variant.weight);
                    weightPathMap.set(variant.weight, variant.path);
                    break;
                default:
                    weightPathMap.set(variant.weight, variant.path)
                    break
            }
        });
        if (pat === '') {
            var min = 10000;
            var mid = 0;
            weightPathMap.forEach((_path: string, weight: number) => {
                if (weight < 500 && weight > 300) {
                    mid = weight;
                }
                if (weight < min) {
                    min = weight;
                }
            })
            if (mid > 0) {
                doc.registerFont('ScriptNormal', weightPathMap.get(mid));
                pat = weightPathMap.get(mid);
            } else {
                var p = weightPathMap.get(min);
                if (p) {
                    doc.registerFont('ScriptNormal', p);
                    pat = p;
                }
            }
        }
        if (pat !== '') {
            weightPathMap.forEach((path: string, weight: number) => {
                if (!initedMap.get('ScriptOblique')) {
                    if (weight < 400) {
                        doc.registerFont('ScriptOblique', path);
                        initedMap.set('ScriptOblique', weight);
                    }
                }
                if (!initedMap.get('ScriptBold')) {
                    if (weight > 400 && weight <= 700) {
                        doc.registerFont('ScriptBold', path);
                        initedMap.set('ScriptBold', weight);
                        weightPathMap.set(weight, path);
                    }
                }
                if (!initedMap.get('ScriptBoldOblique')) {
                    if (weight > 700) {
                        doc.registerFont('ScriptBoldOblique', path);
                        initedMap.set('ScriptBoldOblique', weight);
                        weightPathMap.set(weight, path);
                    }
                }
            })
            // 指定字体，没有粗体/斜体等样式，用常规字体样式替换，避免不能显示打印的问题
            if (!initedMap.get('ScriptBold')) {
                if (initedMap.get('ScriptBoldOblique')) {
                    doc.registerFont('ScriptBold', weightPathMap.get(initedMap.get('ScriptBoldOblique')));
                } else {
                    doc.registerFont('ScriptBold', pat);
                }
            }
            if (!initedMap.get('ScriptOblique')) doc.registerFont('ScriptOblique', pat);
            if (!initedMap.get('ScriptBoldOblique')) {
                if (initedMap.get('ScriptBold')) {
                    doc.registerFont('ScriptBoldOblique', weightPathMap.get(initedMap.get('ScriptBold')));
                } else {
                    doc.registerFont('ScriptBoldOblique', pat);
                }
            }
        }
    }
    if (opts.font_italic !== '') {
        var variants = await fontFinder.listVariants(opts.font_italic);
        var pat = '';
        var patDf = '';
        var hit = false;
        variants.forEach((variant: any) => {
            switch (variant.style) {
                case "regular":
                    pat = variant.path;
                    break;
                case "italic":
                    hit = true;
                    doc.registerFont('ScriptOblique', variant.path);
                    break;
                default:
                    patDf = variant.path;
                    break
            }
        });
        if (!hit && pat !== '') {
            doc.registerFont('ScriptOblique', pat);
        }
        else if (!hit && patDf !== '') {
            doc.registerFont('ScriptOblique', patDf);
        }
    }
    if (opts.font_bold !== '') {
        var variants = await fontFinder.listVariants(opts.font_bold);
        var pat = '';
        var patDf = '';
        var hit = false;
        variants.forEach((variant: any) => {
            switch (variant.style) {
                case "regular":
                    pat = variant.path;
                    break;
                case "bold":
                    hit = true;
                    doc.registerFont('ScriptBold', variant.path);
                    break;
                default:
                    patDf = variant.path;
                    break
            }
        });
        if (!hit && pat !== '') {
            doc.registerFont('ScriptBold', pat);
        }
        else if (!hit && patDf !== '') {
            doc.registerFont('ScriptBold', patDf);
        }
    }
    if (opts.font_bold_italic !== '') {
        var variants = await fontFinder.listVariants(opts.font_bold_italic);
        var pat = '';
        var patDf = '';
        var hit = false;
        variants.forEach((variant: any) => {
            switch (variant.style) {
                case "regular":
                    pat = variant.path;
                    break;
                case "boldItalic":
                    hit = true;
                    doc.registerFont('ScriptBoldOblique', variant.path);
                    break;
                default:
                    patDf = variant.path;
                    break
            }
        });
        if (!hit && pat !== '') {
            doc.registerFont('ScriptBoldOblique', pat);
        }
        else if (!hit && patDf !== '') {
            doc.registerFont('ScriptBoldOblique', patDf);
        }
    }

    doc.font('ScriptNormal');
    doc.fontSize(print.font_size || 12);

    // convert points to inches for text
    doc.reset_format = function () {
        doc.format_state = {
            bold_italic: false,
            bold: false,
            italic: false,
            underline: false,
            override_color: null
        };
    };
    doc.reset_format();
    //var inner_text = doc.text;
    doc.simple_text = function () {
        doc.font('ScriptNormal');
        doc.text.apply(doc, arguments);
    };
    // 缓存doc样式画了后，再恢复之前的样式
    doc.format_text = function (text: string, x: number, y: number, options: any) {
        var cache_current_state = doc.format_state;
        doc.reset_format();
        doc.text2(text, x, y, options);
        doc.format_state = cache_current_state;
    };
    doc.text2 = function (text: string, x: number, y: number, options: any): number {
        options = options || {};
        var color = options.color || 'black';
        color = doc.format_state.override_color ? doc.format_state.override_color : color;

        doc.fill(color);

        if (options.highlight) {
            doc.highlight(x * 72, (y * 72) + doc.currentLineHeight() / 2, doc.widthOfString(text), doc.currentLineHeight(), { color: options.highlightcolor });
        }

        if (print.note.italic) {
            // text = text.replace(/↺/g, '*↺').replace(/↻/g, '↻*');
            text = text.replace(new RegExp(charOfStyleTag.note_begin, 'g'), charOfStyleTag.italic + charOfStyleTag.note_begin).
                replace(new RegExp(charOfStyleTag.note_end, 'g'), charOfStyleTag.note_end + charOfStyleTag.italic);
        }
        var links: { start: number, length: number, url: string }[] = [];
        if (options.links) {
            let match;
            //Clean up all the links, while keeping track of their offset in order to add them back in later.
            while ((match = regex.link.exec(text)) !== null) {
                match.index;
                var trimmed = match[3];
                links.push({
                    start: match.index,
                    length: trimmed.length,
                    url: match[6]
                });
                text = text.slice(0, match.index) + match[3] + text.slice(match.index + match[0].length);
            }
        }
        var split_for_formatting = [];
        //Split the text from the start (or from the previous link) until the current one
        //"This is a link: google.com and this is after"
        // |--------------|----------| - - - - - - - |
        var prevlink = 0;
        for (let i = 0; i < links.length; i++) {
            split_for_formatting.push(text.slice(prevlink, links[i].start));
            split_for_formatting.push(text.slice(links[i].start, links[i].start + links[i].length));
            prevlink = links[i].start + links[i].length;
        }
        //...And then add whatever is left over
        //"This is a link: google.com and this is after"
        // | - - - - - - -| - - - - -|----------------|
        var leftover = text.slice(prevlink, text.length);
        if (leftover) split_for_formatting.push(leftover);

        //Further sub-split for bold, italic, underline, etc...
        for (let i = 0; i < split_for_formatting.length; i++) {
            var innersplit = split_for_formatting[i].split(/(☄)|(☈)|(↭)|(↯)|(↺)|(↻)|(↬)|(☍)|(☋)|(↷)|(↶)|(⇂)|(↿)|(↝)|(↜)/g).filter(function (a) {
                return a;
            });
            split_for_formatting.splice(i, 1, ...innersplit);
            i += innersplit.length - 1;
        }

        var width = options.width ? options.width : print.page_width;
        // var font_width = print.font_width;
        var textobjects = [];
        var currentIndex = 0;
        // var currentWidth = 0;
        for (var i = 0; i < split_for_formatting.length; i++) {
            var elem = split_for_formatting[i];
            if (elem === charOfStyleTag.style_left_stash) {
                opts.stash_style_left_clumn = {
                    bold_italic: doc.format_state.bold_italic,
                    bold: doc.format_state.bold,
                    italic: doc.format_state.italic,
                    underline: doc.format_state.underline,
                    override_color: doc.format_state.override_color,
                    italic_global: opts.italic_global,
                    italic_dynamic: opts.italic_dynamic,
                }
                doc.format_state.bold_italic = false;
                doc.format_state.bold = false;
                doc.format_state.italic = false;
                doc.format_state.underline = false;
                opts.italic_global = false;
                opts.italic_dynamic = false;
                doc.format_state.override_color = null;
                color = options.color || 'black';

            } else if (elem === charOfStyleTag.style_left_pop) {
                doc.format_state.bold_italic = opts.stash_style_left_clumn.bold_italic;
                doc.format_state.bold = opts.stash_style_left_clumn.bold;
                doc.format_state.italic = opts.stash_style_left_clumn.italic;
                doc.format_state.underline = opts.stash_style_left_clumn.underline;
                doc.format_state.override_color = opts.stash_style_left_clumn.override_color;
                opts.italic_global = opts.stash_style_left_clumn.italic_global;
                opts.italic_dynamic = opts.stash_style_left_clumn.italic_dynamic;
            } else if (elem === charOfStyleTag.style_right_stash) {
                opts.stash_style_right_clumn = {
                    bold_italic: doc.format_state.bold_italic,
                    bold: doc.format_state.bold,
                    italic: doc.format_state.italic,
                    underline: doc.format_state.underline,
                    override_color: doc.format_state.override_color,
                    italic_global: opts.italic_global,
                    italic_dynamic: opts.italic_dynamic,
                }
                doc.format_state.bold_italic = false;
                doc.format_state.bold = false;
                doc.format_state.italic = false;
                doc.format_state.underline = false;
                opts.italic_global = false;
                opts.italic_dynamic = false;
                doc.format_state.override_color = null;
                color = options.color || 'black';
            } else if (elem === charOfStyleTag.style_right_pop) {
                doc.format_state.bold_italic = opts.stash_style_right_clumn.bold_italic;
                doc.format_state.bold = opts.stash_style_right_clumn.bold;
                doc.format_state.italic = opts.stash_style_right_clumn.italic;
                doc.format_state.underline = opts.stash_style_right_clumn.underline;
                doc.format_state.override_color = opts.stash_style_right_clumn.override_color;
                opts.italic_global = opts.stash_style_right_clumn.italic_global;
                opts.italic_dynamic = opts.stash_style_right_clumn.italic_dynamic;
            } else if (elem === charOfStyleTag.italic_global_begin) {
                opts.italic_dynamic = doc.format_state.italic; //记录 global 前状态， 在 global 期间记录 italic 的切换记数。
                opts.italic_global = true;
                doc.format_state.italic = true; // 强制在整个 global 中保持 italic 样式
            } else if (elem === charOfStyleTag.italic_global_end) {
                doc.format_state.italic = opts.italic_dynamic;
                opts.italic_global = false;
            } else if (elem === charOfStyleTag.bold_italic) {
                // doc.format_state.italic = !doc.format_state.italic;
                doc.format_state.bold_italic = !doc.format_state.bold_italic;
            } else if (elem === charOfStyleTag.bold) {
                doc.format_state.bold = !doc.format_state.bold;
            } else if (elem === charOfStyleTag.italic) {
                if (opts.italic_global) {
                    opts.italic_dynamic = !opts.italic_dynamic;
                } else {
                    doc.format_state.italic = !doc.format_state.italic;
                }
            } else if (elem === charOfStyleTag.underline) {
                doc.format_state.underline = !doc.format_state.underline;
            } else if (elem === charOfStyleTag.note_begin) {
                doc.format_state.override_color = (print.note && print.note.color) || '#000000';
            } else if (elem === charOfStyleTag.note_end) {
                doc.format_state.override_color = null;
                color = options.color || 'black';
            } else {
                let font = 'ScriptNormal';
                if (doc.format_state.bold_italic) {
                    font = 'ScriptBoldOblique';
                } else if (doc.format_state.bold || options.bold) {
                    font = 'ScriptBold';
                } else if (doc.format_state.italic) {
                    font = 'ScriptOblique';
                }
                // if (elem === '\\_' || elem === '\\*') {
                //     elem = elem.substr(1, 1);
                // }
                var linkurl = undefined;
                for (const link of links) {
                    if (link.start <= currentIndex && currentIndex < link.start + link.length) {
                        linkurl = link.url;
                    }
                }
                // for (var j = 0; j < elem.length; j++) {
                //     if (elem[j] == '\n') {
                //         currentWidth = 0;
                //     } else if (elem[j] == ' ') {
                //         currentWidth += 0.5;
                //     } else if (elem.charCodeAt(j) < 255) {
                //         currentWidth += 1;
                //     } else {
                //         currentWidth += 1.6;
                //     }
                //     if (currentWidth > width * 9) {
                //         // currentWidth = 0;
                //         // elem = elem.slice(0, j + 1) + '\n' + elem.slice(j);
                //         // j++;
                //         var enSplit = false;
                //         if (elem.charCodeAt(j) < 255) {
                //             // 处理英文单词，不截断单词
                //             for (var k = j; k >= 0; k--) {
                //                 if (elem[k] === " ") {
                //                     if (k > 0) {
                //                         elem = elem.slice(0, k) + '\n' + elem.slice(k + 1);
                //                         j = k - 1;
                //                     }
                //                     enSplit = true;
                //                     break;
                //                 } else if (elem.charCodeAt(k) > 255) {
                //                     if (k > 0) {
                //                         elem = elem.slice(0, k + 1) + '\n' + elem.slice(k + 1);
                //                         j = k;
                //                     }
                //                     enSplit = true;
                //                     break;
                //                 } else if (elem[k] === "\n") {
                //                     break;
                //                 }
                //             }
                //         }
                //         if (!enSplit) {
                //             elem = elem.slice(0, j + 1) + '\n' + elem.slice(j + 1);
                //         }

                //     }
                // }
                textobjects.push({
                    lineBreak: false,
                    text: elem,
                    link: linkurl,
                    font: font,
                    underline: linkurl || doc.format_state.underline,
                    color: doc.format_state.override_color ? doc.format_state.override_color : color
                });
            }
            currentIndex += elem.length;
            /*inner_text.call(doc, elem, x * 72, y * 72, {
                underline: doc.format_state.underline,
                lineBreak: options.line_break,
                width: options.width * 72,
                align: options.align
            });*/
        }

        return addTextbox(textobjects, doc, x * 72, y * 72, (width - textbox_width_error) * 72, { // 组件bug,text显示宽度比实际配置的width值要大
            font_height: print.font_height * 72,
            lineBreak: false,
            align: options.align,
            baseline: 'top',
        });

    };

    function splitBy(text: string, delimiter: string) {
        var
            delimiterPATTERN = '(' + delimiter + ')',
            delimiterRE = new RegExp(delimiterPATTERN, 'g');

        return text.split(delimiterRE).reduce(function (chunks, item) {
            if (item.match(delimiterRE)) {
                chunks.push(item)
            } else {
                chunks[chunks.length - 1] += item
            };
            return chunks
        }, [])
    }

    interface image { path: string }
    doc.text2withImages = function (text: string, x: number, y: number, options: any) {
        let textparts = splitBy(text, regex.link.source);
        var parts: { text?: string, image?: image }[] = [];
        for (let i = 0; i < textparts.length; i++) {
            let match = regex.link.exec(textparts[i]);
            if (match.length > 0) {
                parts.push({ image: { path: match[6] } });
                parts.push({ text: textparts[i].slice(match[0].length) })
            }
            else {
                parts.push({ text: textparts[i] });
            }
        }
        var additionalY = 0;
        for (const part of parts) {
            if (part.text) {
                doc.text2(part.text, x, y + additionalY, options);
            }
        }
    }

    return doc;
}

function clearFormatting(text: string) {
    var clean = text.replace(/☈|↭|↯|☄|↬|☍|☋|/g, '');
    // var clean = text.replace(/\*/g, '');
    // clean = clean.replace(/_/g, '');
    return clean;
}

function inline(text: string) {
    return text.replace(/\n/g, ' ');
}

function finishDoc(doc: any, filepath: string) {
    doc.pipe(create_simplestream(filepath));
    doc.end();
}


var get_title_page_token = function (parsed: any, type: string): any {
    var result = null;
    if (parsed && parsed.title_page) {
        for (const section of Object.keys(parsed.title_page)) {
            parsed.title_page[section].forEach(function (token: any) {
                if (token.is(type)) {
                    result = token;
                }
            });
        }

    }
    return result;
};

async function generate(doc: any, opts: any, lineStructs?: Map<number, lineStruct>) {
    var parsed = opts.parsed,
        cfg = opts.config,
        print = opts.print,
        lines = parsed.lines,
        exportcfg = opts.exportconfig;

    var title_token = get_title_page_token(parsed, 'title');
    var author_token = get_title_page_token(parsed, 'author');
    if (!author_token) {
        author_token = get_title_page_token(parsed, 'authors');
    }

    doc.info.Title = title_token ? clearFormatting(inline(title_token.text)) : '';
    doc.info.Author = author_token ? clearFormatting(inline(author_token.text)) : '';
    doc.info.Creator = 'betterfountain';

    // helper
    var center = function (txt: string, y: number): number {
        // var txt_length = txt.replace(/\*/g, '').replace(/_/g, '').length;
        // var txt_length = get_text_display_len(clearFormatting(txt));
        // var feed = (print.page_width - txt_length * print.font_width) / 2;
        return doc.text2(txt, 0, y, { align: 'center' });
    };

    //var title_y = print.title_page.top_start;

    /*var title_page_next_line = function() {
        title_y += print.line_spacing * print.font_height;
    };

    /*var title_page_main = function(parsed?:any, type?:string, options?:any) {
        options = options || {};
        if (arguments.length === 0) {
            title_page_next_line();
            return;
        }
        var token = get_title_page_token(parsed, type);
        if (token) {
            token.text.split('\n').forEach(function(line:string) {
                if (options.capitalize) {
                    line = line.toUpperCase();
                }
                center(line, title_y);
                title_page_next_line();
            });
        }
    };*/

    if (cfg.print_title_page && parsed.title_page) {

        if (parsed.title_page['tl'].length > 0 || parsed.title_page['tc'].length > 0 || parsed.title_page['tr'].length > 0 ||
            parsed.title_page['bl'].length > 0 || parsed.title_page['cc'].length > 0 || parsed.title_page['br'].length > 0
        ) {

            const innerwidth = print.page_width - print.left_margin - print.right_margin;
            const innerheight = print.page_height - print.top_margin;
            const innerwidth_third = innerwidth / 3;
            const innerwidth_half = innerwidth / 2;
            const joinChar = '\n\n';
            //top left
            var tltext = parsed.title_page['tl'].sort(helpers.sort_index).map((x: any) => x.text).join(joinChar);
            var tltext_height = doc.heightOfString(tltext, { width: innerwidth_third * 72, align: 'left' });

            doc.text2(tltext, print.left_margin, print.top_margin, {
                width: innerwidth_third,
                align: 'left',
                links: true
            });

            //top center
            var tctext = parsed.title_page['tc'].sort(helpers.sort_index).map((x: any) => x.text).join(joinChar);
            var tctext_height = doc.heightOfString(tctext, { width: innerwidth_third * 72, align: 'center' });
            doc.text2(tctext, print.left_margin + innerwidth_third, print.top_margin, {
                width: innerwidth_third,
                align: 'center',
                links: true
            });

            //top right
            var trtext = parsed.title_page['tr'].sort(helpers.sort_index).map((x: any) => x.text).join(joinChar);
            var trtext_height = doc.heightOfString(trtext, { width: innerwidth_third * 72, align: 'right' });
            doc.text2(trtext, print.left_margin + innerwidth_third + innerwidth_third, print.top_margin, {
                width: innerwidth_third,
                align: 'right',
                links: true
            });

            //bottom left
            var bltext = parsed.title_page['bl'].sort(helpers.sort_index).map((x: any) => x.text).join(joinChar);
            var bltext_height = doc.heightOfString(bltext, { width: innerwidth_half * 72, align: 'left' });
            doc.text2(bltext, print.left_margin, innerheight - (bltext_height / 72), {
                width: innerwidth_half,
                align: 'left',
                links: true
            });

            //bottom right
            var brtext = parsed.title_page['br'].sort(helpers.sort_index).map((x: any) => x.text).join(joinChar);
            var brtext_height = doc.heightOfString(brtext, { width: innerwidth_half * 72, align: 'right' });
            doc.text2(brtext, print.left_margin + innerwidth_half, innerheight - (brtext_height / 72), {
                width: innerwidth_half,
                align: 'right',
                links: true
            });

            //center center
            var topheight = Math.max(tltext_height, tctext_height, trtext_height, 0);
            var bottomheight = Math.max(bltext_height, brtext_height, 0);

            var cctext = parsed.title_page['cc'].sort(helpers.sort_index).map((x: any) => x.text).join(joinChar);
            var cctext_height = doc.heightOfString(cctext, { width: innerwidth * 72, align: 'center' });
            var centerStart = (((innerheight * 72) - topheight - bottomheight) / 2) - (cctext_height / 2);
            doc.text2(cctext, print.left_margin, centerStart / 72, {
                width: innerwidth,
                align: 'center',
                links: true
            });

            /*
            // title page
            title_page_main(parsed, 'title', {
                capitalize: true
            });
            title_page_main();
            title_page_main();
            title_page_main(parsed, 'credit');
            title_page_main();
            title_page_main(parsed, 'author');
            title_page_main();
            title_page_main();
            title_page_main();
            title_page_main();
            title_page_main(parsed, 'source');
    
            var concat_types = function(parsed:any, prev:any, type:string) {
                var token = get_title_page_token(parsed, type);
                if (token) {
                    prev = prev.concat(token.text.split('\n'));
                }
                return prev;
            };
            var left_side = print.title_page.left_side.reduce(concat_types.bind(null, parsed), []),
                right_side = print.title_page.right_side.reduce(concat_types.bind(null, parsed), []),
                title_page_extra = function(x:number) {
                    return function(line:string) {
                        doc.text(line.trim(), x, title_y);
                        title_page_next_line();
                    };
                };
    
            title_y = 8.5;
            left_side.forEach(title_page_extra(1.3));
    
            title_y = 8.5;
            right_side.forEach(title_page_extra(5));
    */
            // script
            doc.addPage();

        }


    }

    if (opts.hooks && opts.hooks.before_script) {
        opts.hooks.before_script(doc);
    }

    var y = 0,
        page = 0,
        scene_number: string,
        // prev_scene_continuation_header = '',
        scene_continuations: { [key: string]: any } = {},
        current_section_level = 0,
        current_section_number: any,
        current_section_token: any,
        section_number = helpers.version_generator(),
        text,
        after_section = false; // helpful to determine synopsis indentation

    var print_header_and_footer = function () {
        var dif = print.font_height * 0.5
        if (cfg.print_header) {
            doc.format_text(cfg.print_header, 1.5, print.page_number_top_margin, {
                color: '#777777'
            });
        }
        if (cfg.print_footer) {
            doc.format_text(cfg.print_footer, 1.5, print.page_height - print.page_number_top_margin - dif, {
                color: '#777777'
            });
        }
    };


    var print_watermark = function () {
        if (cfg.print_watermark) {
            var options = {
                origin: [0, 0]
            },
                font_size,
                angle = Math.atan(print.page_height / print.page_width) * 180 / Math.PI,
                diagonal,
                watermark;

            // underline and rotate pdfkit bug (?) workaround
            watermark = cfg.print_watermark.replace(/_/g, '');
            // unformat
            // len = watermark.replace(/\*/g, '').length;
            // len = clearFormatting(watermark).length;

            diagonal = Math.sqrt(Math.pow(print.page_width, 2) + Math.pow(print.page_height, 2));
            diagonal -= 4;

            var lls = (watermark.split('\n').length / 2) + 1;
            // font_size = (1.667 * diagonal) / len * 72;
            font_size = print.font_size || 12;
            doc.fontSize(font_size);
            doc.rotate(angle, options);
            doc.format_text(watermark, 2, -(font_size * lls) / 72, {
                color: '#eeeeee',
                line_break: false,
                width: diagonal,
                align: 'center',
            });
            doc.rotate(-angle, options);
            doc.fontSize(print.font_size || 12);
        }
    };

    // 显示长度
    // function get_text_display_len(text: any): any {
    //     var len = 0;
    //     for (var i = 0; i < text.length; i++) {
    //         // 判断字符是否 双角
    //         if (text.charCodeAt(i) > 255) {
    //             // 是双角, 长度按 1.5 增加
    //             len += 1.6;
    //         } else if (text[i] === " ") {
    //             //空格按0增加
    //             len += 0.5;
    //         } else {
    //             len += 1;
    //         }
    //     }
    //     return len;
    // }

    function getOutlineChild(obj: any, targetDepth: number, currentDepth: number): any {
        if (currentDepth == targetDepth) {
            return obj;
        }
        if (obj.children.length > 0) {
            //get the last child
            currentDepth++;
            return getOutlineChild(obj.children[obj.children.length - 1], targetDepth, currentDepth);
        }
        else {
            return obj;
        }
    }

    function print_page_number() {
        var page_num_y = print.page_height - print.page_number_top_margin;
        if (cfg.show_page_numbers) {
            var page_num = cfg.show_page_numbers.replace("{n}", page.toFixed());
            // var number_x = print.action.feed + print.action.max * print.font_width - page_num.length * print.font_width;
            // doc.simple_text(page_num, number_x * 72, page_num_y * 72);
            doc.format_text(page_num, 0, page_num_y, { align: 'right', width: print.page_width - print.right_margin });
        }
    }

    let outline = doc.outline;
    let outlineDepth = 0;
    // let previousSectionDepth = 0;

    if (page === 0) {
        page++

        print_page_number();
        print_watermark();
        print_header_and_footer();
    }


    let currentScene: string = "";
    let currentSections: string[] = [];
    let currentDuration: number = 0;
    let right_column_pass: number = 0;
    let right_column_temp: any[] = [];
    let y_right = 0;

    lines.forEach(function (line: any) {

        if (line.type === "page_break") {
            // if (line.text) {
            //     // 可能是合并的空行，只含样式字符
            //     // 绘制样式
            //     doc.text2(line.text, 0, 0);
            // }

            if (cfg.scene_continuation_bottom && line.scene_split) {
                var scene_continued_text = '(' + (cfg.text_scene_continued || 'CONTINUED') + ')';
                // var feed = print.action.feed + print.action.max * print.font_width - get_text_display_len(scene_continued_text) * print.font_width;
                // doc.simple_text(scene_continued_text, feed * 72, (print.top_margin + print.font_height * (y + 2)) * 72);
                doc.format_text(scene_continued_text, 0, (print.top_margin + print.font_height * (y + 1)), { align: 'right', width: print.page_width - print.right_margin });

            }

            if (lineStructs) {
                if (line.token.line && !lineStructs.has(line.token.line)) {
                    lineStructs.set(line.token.line, { page: page, scene: currentScene, cumulativeDuration: currentDuration, sections: currentSections.slice(0) })
                }
            }

            y = 0;
            doc.addPage();
            page++;

            var number_y = print.font_height * 0.5 + print.page_number_top_margin;

            if (cfg.scene_continuation_top && line.scene_split) {
                scene_continuations[scene_number] = scene_continuations[scene_number] || 0;
                scene_continuations[scene_number]++;

                var scene_continued = (cfg.scenes_numbers !== 'none' && scene_number ? scene_number + ' ' : '') + (cfg.text_scene_continued || 'CONTINUED') + ':';
                scene_continued += scene_continuations[scene_number] > 1 ? ' (' + scene_continuations[scene_number] + ')' : '';

                scene_continued = clearFormatting(scene_continued);
                // scene_continued = scene_continued.replace(/\*/g, '');
                // scene_continued = scene_continued.replace(/_/g, '');
                // var feed = print.action.feed + print.action.max * print.font_width - get_text_display_len(scene_continued) * print.font_width;
                // doc.simple_text(scene_continued, feed * 72, number_y * 72);
                // prev_scene_continuation_header = scene_continued;
                doc.format_text(scene_continued, 0, number_y, { align: 'right', width: print.page_width - print.right_margin });

            }

            print_page_number();
            print_watermark();
            print_header_and_footer();
            // prev_scene_continuation_header = '';

        }
        else if (y === 0
            && line.type !== "dialogue_fake" && line.type !== "more" && line.type !== "character"
            && isBlankLineAfterStlyle(line.text)) {

            // 每页开头的 空行（只有样式字符），不增加行，只绘制样式，当删除空行处理

            // 绘制样式
            doc.text2(line.text, 0, print.top_margin + print.font_height * y);


            if (lineStructs) {
                if (line.token.line && !lineStructs.has(line.token.line)) {
                    lineStructs.set(line.token.line, { page: page, scene: currentScene, cumulativeDuration: currentDuration, sections: currentSections.slice(0) })
                }
            }
        }
        else if (line.type === "separator") {

            y++;

            if (lineStructs) {
                if (line.token.line && !lineStructs.has(line.token.line)) {
                    lineStructs.set(line.token.line, { page: page, scene: currentScene, cumulativeDuration: currentDuration, sections: currentSections.slice(0) })
                }
            }
        } else {
            // formatting not supported yet
            text = line.text;

            var color = (print[line.type] && print[line.type].color) || '#000000';

            var general_text_properties = {
                color: color,
                highlight: false,
                bold: false,
                highlightcolor: [0, 0, 0],
                width: 0,
                align: 'left',
            }

            function get_text_properties(lline = line, expcfg = exportcfg, old_text_properties = general_text_properties) {
                var new_text_properties = Object.assign({}, old_text_properties)
                if (!!expcfg && lline.type === 'character') {
                    var character = trimCharacterExtension(lline.text)
                    // refer to Liner in ./liner.ts
                    character = character.replace(/([0-9]* - )/, "");
                    if (!!expcfg.highlighted_characters && expcfg.highlighted_characters.includes(character)) {
                        new_text_properties.highlight = true;
                        new_text_properties.highlightcolor = wordToColor(character);
                    };
                };
                // if (cfg.embolden_character_names && lline.type === 'character') {
                //     new_text_properties.bold = true;
                // }
                return new_text_properties
            }
            // TODO Arming (2024-08-29) : 
            function wrapCharAndDialog(intput: any, lline = line): any {
                if (lline.type === "character") {
                    if (cfg.embolden_character_names) {
                        if (intput.endsWith(cfg.text_contd)) {
                            intput = intput.substring(0, intput.length - cfg.text_contd.length);
                            intput = charOfStyleTag.bold + intput + charOfStyleTag.bold + cfg.text_contd;
                        } else {
                            intput = charOfStyleTag.bold + intput + charOfStyleTag.bold;
                        }
                    }
                    // intput = charOfStyleTag.style_stash + intput + charOfStyleTag.style_pop;
                }
                // if (lline.type === "more") {
                //     intput = charOfStyleTag.style_stash + intput + charOfStyleTag.style_pop;
                // }
                // if (lline.type === "dialogue") {
                //     if (cfg.emitalic_dialog) {
                //         if(!intput.endsWith('*') || !intput.startsWith('*')){
                //             intput = '*' + intput + '*';
                //         }
                //     }
                // }
                return intput
            }

            var text_properties = get_text_properties();

            if (line.type == "parenthetical" && !text.startsWith("(")) {
                text = " " + text;
            }

            if (line.type === 'centered') {
                var ls = center(text, print.top_margin + print.font_height * y++);
                y += ls - 1;
            } else if (line.type === "transition") {
                var feed: number = print.action.feed;
                text_properties.width = print.page_width - feed - feed;
                text_properties.align = 'right';
                var lss = doc.text2(text, feed, print.top_margin + print.font_height * y, text_properties);
                y += lss - 1;
            } else {
                var feed: number = (print[line.type] || {}).feed || print.action.feed;
                text_properties.width = print.page_width - feed - print.right_margin;
                // if (line.type === "transition") {
                //     feed = print.action.feed + print.action.max * print.font_width - get_text_display_len(line.text) * print.font_width;
                // }

                var hasInvisibleSection = (line.type === "scene_heading" && line.token.invisibleSections != undefined)
                function processSection(sectiontoken: any) {
                    let sectiontext = sectiontoken.text;
                    current_section_level = sectiontoken.level;
                    currentSections.length = sectiontoken.level - 1;

                    currentSections.push(he.encode(sectiontext));
                    if (!hasInvisibleSection)
                        feed += current_section_level * print.section.level_indent;
                    if (cfg.number_sections) {
                        if (sectiontoken !== current_section_token) {
                            current_section_number = section_number(sectiontoken.level);
                            current_section_token = sectiontoken;
                            sectiontext = current_section_number + '. ' + sectiontext;
                        } else {
                            sectiontext = Array(current_section_number.length + 3).join(' ') + sectiontext;
                        }

                    }
                    if (cfg.create_bookmarks) {
                        if (hasInvisibleSection && !cfg.invisible_section_bookmarks) return;
                        var oc = getOutlineChild(outline, sectiontoken.level - 1, 0);
                        if (oc != undefined)
                            oc.addItem(sectiontext);
                    }
                    if (!hasInvisibleSection) {
                        text = sectiontext;
                    }
                    outlineDepth = sectiontoken.level;
                }
                if (line.type === 'section' || hasInvisibleSection) {
                    if (hasInvisibleSection) {
                        for (let i = 0; i < line.token.invisibleSections.length; i++) {
                            processSection(line.token.invisibleSections[i]);
                        }
                    }
                    else {
                        processSection(line.token);
                    }

                }


                if (line.type === "scene_heading") {
                    if (cfg.create_bookmarks) {
                        getOutlineChild(outline, outlineDepth, 0).addItem(text);
                    }
                    currentScene = text;
                    if (cfg.embolden_scene_headers) {
                        text = charOfStyleTag.bold + text + charOfStyleTag.bold;
                    }
                    if (cfg.underline_scene_headers) {
                        text = charOfStyleTag.underline + text + charOfStyleTag.underline;
                    }
                }

                text = wrapCharAndDialog(text, line)

                if (line.type === 'synopsis') {
                    if (print.synopsis.feed_with_last_section && after_section) {
                        feed += current_section_level * print.section.level_indent;
                    } else {
                        feed = print.action.feed;
                    }
                    feed += print.synopsis.padding || 0;
                    text_properties.width = print.page_width - feed - feed;
                    // text_properties.align = 'center';
                }


                if (print[line.type] && print[line.type].italic && text) {
                    text = charOfStyleTag.italic + text + charOfStyleTag.italic;
                }

                if (line.token && line.token.dual) {
                    if (line.right_column) {
                        // 缓存，画完左边再回头画右边
                        right_column_pass = 0;
                        right_column_temp = line.right_column;
                        y_right = y;
                    }
                    var feed_diff = 0.2;

                    if (line.type === "parenthetical") {
                        feed = print.action.feed + feed_diff;
                        text_properties.width = print.page_width / 2 - print.action.feed - feed_diff * 3;
                    }
                    else if (line.type === "character" || line.type === "more") {
                        feed = print.action.feed + feed_diff * 2;
                        text_properties.width = print.page_width / 2 - print.action.feed - feed_diff * 5;
                    } else {
                        feed = print.action.feed
                        text_properties.width = print.page_width / 2 - print.action.feed - feed_diff;
                    }
                    // feed -= (feed) / 2;
                }

                var lss = doc.text2(text, feed, print.top_margin + print.font_height * y, text_properties);
                y += lss - 1;
                if (line.linediff) {
                    y += line.linediff;
                }

                // 先画左对话，再画右
                if (right_column_temp.length > 0) {
                    right_column_pass++;
                    if (right_column_pass >= right_column_temp.length) {
                        var feed_diff = 0.2;
                        right_column_temp.forEach(function (right_line: any) {
                            var right_text_properties = get_text_properties(right_line);

                            var feed_right = 0;
                            if (right_line.type === "parenthetical") {
                                feed_right = (print.page_width / 2) + feed_diff * 2;
                                right_text_properties.width = print.page_width / 2 - print.action.feed - feed_diff * 3;
                            }
                            else if (right_line.type === "character" || right_line.type === "more") {
                                feed_right = (print.page_width / 2) + feed_diff * 3;
                                right_text_properties.width = print.page_width / 2 - print.action.feed - feed_diff * 5;
                            } else {
                                feed_right = (print.page_width / 2) + feed_diff;
                                right_text_properties.width = print.page_width / 2 - print.action.feed - feed_diff;
                            }

                            // var feed_right =( print.page_width+ print.left_margin)/2;
                            // var feed_right = (print[right_line.type] || {}).feed || print.action.feed;
                            // feed_right -= (feed_right + print.left_margin) / 2;
                            // feed_right += (print.page_width - print.right_margin - print.left_margin) / 2;
                            // feed_right += print.left_margin / 4;
                            // feed_right -= 0.5; //textbox_width_error;

                            var tx = wrapCharAndDialog(right_line.text, right_line);
                            right_text_properties.width = print.page_width - feed_right - print.right_margin;
                            var ls = doc.text2(tx, feed_right, print.top_margin + print.font_height * y_right++, right_text_properties);
                            y_right += ls - 1;
                        });

                        right_column_temp = [];
                        right_column_pass = 0;
                    }
                }

                if (line.number) {
                    scene_number = String(line.number);
                    var scene_text_length = scene_number.length;
                    if (cfg.embolden_scene_headers) {
                        scene_number = charOfStyleTag.bold + scene_number + charOfStyleTag.bold;
                    }
                    if (cfg.underline_scene_headers) {
                        scene_number = charOfStyleTag.underline + scene_number + charOfStyleTag.underline;
                    }

                    var shift_scene_number;

                    if (cfg.scenes_numbers === 'both' || cfg.scenes_numbers === 'left') {
                        shift_scene_number = (scene_text_length + 4) * print.font_width;
                        var lss = doc.text2(scene_number, feed - shift_scene_number, print.top_margin + print.font_height * y, text_properties);
                        y += lss - 1;
                    }

                    if (cfg.scenes_numbers === 'both' || cfg.scenes_numbers === 'right') {
                        shift_scene_number = (print.scene_heading.max + 1) * print.font_width;
                        var lss = doc.text2(scene_number, feed + shift_scene_number, print.top_margin + print.font_height * y, text_properties);
                        y += lss - 1;
                    }
                }
                y++;
            }
            if (lineStructs) {
                if (line.token.line && !lineStructs.has(line.token.line)) {
                    if (line.token.time) currentDuration += line.token.time;
                    lineStructs.set(line.token.line, { page: page, scene: currentScene, sections: currentSections.slice(0), cumulativeDuration: currentDuration })
                }
            }
        }


        // clear after section
        if (line.type === 'section') {
            after_section = true;
        } else if (line.type === 'scene_heading') {
            after_section = false;
        }

    });

}

export var get_pdf = async function (opts: Options, progress: vscode.Progress<{ message?: string; increment?: number; }>) {
    progress.report({ message: "Processing document", increment: 25 });
    var doc = await initDoc(opts);
    generate(doc, opts,);
    progress.report({ message: "Writing to disk", increment: 25 });
    finishDoc(doc, opts.filepath);
};

export type lineStruct = {
    sections: string[],
    scene: string,
    page: number,
    cumulativeDuration: number
}

export type pdfstats = {
    pagecount: number,
    pagecountReal: number,
    linemap: Map<number, lineStruct> //the structure of each line
}
export type PdfAsBase64 = {
    data: string;
    stats: pdfstats;
}

export var get_pdf_stats = async function (opts: Options): Promise<pdfstats> {
    var doc = await initDoc(opts);
    let stats: pdfstats = { pagecount: 1, pagecountReal: 1, linemap: new Map<number, lineStruct>() };
    stats.pagecount = opts.parsed.lines.length / opts.print.lines_per_page;
    doc.on('pageAdded', () => {
        stats.pagecountReal++;
    });

    await generate(doc, opts, stats.linemap);
    return stats;
}

const toBase64 = (doc: any): Promise<string> => {
    return new Promise((resolve, reject) => {
        try {
            const stream = doc.pipe(new Base64Encode());

            let base64Value = '';
            stream.on('data', (chunk: any) => {
                base64Value += chunk;
            });

            stream.on('end', () => {
                resolve(base64Value);
            });
        } catch (e) {
            reject(e);
        }
    });
};


export var get_pdf_base64 = async function (opts: Options): Promise<PdfAsBase64> {
    var doc = await initDoc(opts);
    let stats: pdfstats = { pagecount: 1, pagecountReal: 1, linemap: new Map<number, lineStruct>() };
    stats.pagecount = opts.parsed.lines.length / opts.print.lines_per_page;
    doc.on('pageAdded', () => {
        stats.pagecountReal++;
    });
    await generate(doc, opts, stats.linemap);
    doc.end();
    return {
        data: await toBase64(doc),
        stats: stats
    }
}