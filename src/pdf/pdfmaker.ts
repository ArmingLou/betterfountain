// TODO: Extract pdfmaker to a separate library (+++++)

import * as fountainconfig from "../configloader";
import * as print from "./print";
import * as path from 'path';
import * as vscode from 'vscode';
import helpers from "../helpers";
import { cleanStlyleChars, isBlankLineAfterStlyle, openFile, revealFile, trimCharacterExtension, wordToColor } from "../utils";
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
    stash_style_global_clumn: StyleStash;
    italic_global: boolean;
    italic_dynamic: boolean;
    found_font_italic: boolean;
    found_font_bold: boolean;
    found_font_bold_italic: boolean;
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

// const textbox_width_error = 0;

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
        },
        bufferPages: true
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
    //Load Courier Prime by default, and replace the variants if requested and available
    var fp = __dirname.slice(0, __dirname.lastIndexOf(path.sep)) + path.sep + 'courierprime' + path.sep
    doc.registerFont('ScriptNormal', fp + 'courier-prime.ttf');
    doc.registerFont('ScriptBold', fp + 'courier-prime-bold.ttf');
    doc.registerFont('ScriptBoldOblique', fp + 'courier-prime-bold-italic.ttf');
    doc.registerFont('ScriptOblique', fp + 'courier-prime-italic.ttf');
    opts.found_font_bold = true;
    opts.found_font_italic = true;
    opts.found_font_bold_italic = true;

    if (opts.font != "Courier Prime") {
        opts.found_font_bold = false;
        opts.found_font_italic = false;
        opts.found_font_bold_italic = false;

        var variants = await fontFinder.listVariants(opts.font);
        var initedMap = new Map<string, number>();
        var weightPathMap = new Map<number, string>();
        var pat = '';
        var normalWei = 0;
        variants.forEach((variant: any) => {
            switch (variant.style) {
                case "regular":
                    doc.registerFont('ScriptNormal', variant.path);
                    pat = variant.path;
                    initedMap.set('ScriptNormal', variant.weight);
                    weightPathMap.set(variant.weight, variant.path);
                    normalWei = variant.weight;
                    break;
                case "bold":
                    doc.registerFont('ScriptBold', variant.path);
                    initedMap.set('ScriptBold', variant.weight);
                    weightPathMap.set(variant.weight, variant.path);
                    opts.found_font_bold = true;
                    break;
                case "italic":
                    doc.registerFont('ScriptOblique', variant.path);
                    initedMap.set('ScriptOblique', variant.weight);
                    weightPathMap.set(variant.weight, variant.path);
                    opts.found_font_italic = true;
                    break;
                case "boldItalic":
                    doc.registerFont('ScriptBoldOblique', variant.path);
                    initedMap.set('ScriptBoldOblique', variant.weight);
                    weightPathMap.set(variant.weight, variant.path);
                    opts.found_font_bold_italic = true;
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
                normalWei = mid;
            } else {
                var p = weightPathMap.get(min);
                if (p) {
                    doc.registerFont('ScriptNormal', p);
                    pat = p;
                    normalWei = min;
                }
            }
        }
        if (pat !== '') {
            weightPathMap.forEach((path: string, weight: number) => {
                // if (!initedMap.get('ScriptOblique')) {
                //     if (weight < 400) {
                //         doc.registerFont('ScriptOblique', path);
                //         initedMap.set('ScriptOblique', weight);
                //     }
                // }
                if (!initedMap.get('ScriptBold')) {
                    // if (weight > 400 && weight <= 700) {
                    if (weight > normalWei && weight <= normalWei + 300) {
                        doc.registerFont('ScriptBold', path);
                        initedMap.set('ScriptBold', weight);
                        weightPathMap.set(weight, path);
                        opts.found_font_bold = true;
                    }
                }
                // if (!initedMap.get('ScriptBoldOblique')) {
                //     if (weight > 700) {
                //         doc.registerFont('ScriptBoldOblique', path);
                //         initedMap.set('ScriptBoldOblique', weight);
                //         weightPathMap.set(weight, path);
                //     }
                // }
            })
            // 指定字体，没有粗体/斜体等样式，用常规字体样式替换，避免不能显示打印的问题
            if (!initedMap.get('ScriptBold')) {
                // if (initedMap.get('ScriptBoldOblique')) {
                //     doc.registerFont('ScriptBold', weightPathMap.get(initedMap.get('ScriptBoldOblique')));
                // } else {
                //     doc.registerFont('ScriptBold', pat);
                // }
                weightPathMap.forEach((path: string, weight: number) => {
                    if (!initedMap.get('ScriptBold')) {
                        // if (weight > 400 && weight <= 700) {
                        if (weight > normalWei) {
                            doc.registerFont('ScriptBold', path);
                            initedMap.set('ScriptBold', weight);
                            weightPathMap.set(weight, path);
                            opts.found_font_bold = true;
                        }
                    }
                })
            }
            // if (!initedMap.get('ScriptOblique')) doc.registerFont('ScriptOblique', pat);
            // if (!initedMap.get('ScriptBoldOblique')) {
            //     if (initedMap.get('ScriptBold')) {
            //         doc.registerFont('ScriptBoldOblique', weightPathMap.get(initedMap.get('ScriptBold')));
            //     } else {
            //         doc.registerFont('ScriptBoldOblique', pat);
            //     }
            // }
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
                    opts.found_font_italic = true;
                    break;
                default:
                    patDf = variant.path;
                    break
            }
        });
        if (!hit && pat !== '') {
            doc.registerFont('ScriptOblique', pat);
            opts.found_font_italic = true;
        }
        else if (!hit && patDf !== '') {
            doc.registerFont('ScriptOblique', patDf);
            opts.found_font_italic = true;
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
                    opts.found_font_bold = true;
                    break;
                default:
                    patDf = variant.path;
                    break
            }
        });
        if (!hit && pat !== '') {
            doc.registerFont('ScriptBold', pat);
            opts.found_font_bold = true;
        }
        else if (!hit && patDf !== '') {
            doc.registerFont('ScriptBold', patDf);
            opts.found_font_bold = true;

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
                    opts.found_font_bold_italic = true;
                    break;
                default:
                    patDf = variant.path;
                    break
            }
        });
        if (!hit && pat !== '') {
            doc.registerFont('ScriptBoldOblique', pat);
            opts.found_font_bold_italic = true;
        }
        else if (!hit && patDf !== '') {
            doc.registerFont('ScriptBoldOblique', patDf);
            opts.found_font_bold_italic = true;
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
        opts.italic_global = false;
        opts.italic_dynamic = false;
    };
    doc.reset_format();
    // doc.format_state = {
    //     bold_italic: false,
    //     bold: false,
    //     italic: false,
    //     underline: false,
    //     override_color: null
    // };

    doc.global_stash = function () {
        opts.stash_style_global_clumn = {
            bold_italic: doc.format_state.bold_italic,
            bold: doc.format_state.bold,
            italic: doc.format_state.italic,
            underline: doc.format_state.underline,
            override_color: doc.format_state.override_color,
            italic_global: opts.italic_global,
            italic_dynamic: opts.italic_dynamic,
        }
        doc.reset_format();
    };
    doc.global_pop = function () {
        doc.format_state.bold_italic = opts.stash_style_global_clumn.bold_italic;
        doc.format_state.bold = opts.stash_style_global_clumn.bold;
        doc.format_state.italic = opts.stash_style_global_clumn.italic;
        doc.format_state.underline = opts.stash_style_global_clumn.underline;
        doc.format_state.override_color = opts.stash_style_global_clumn.override_color;
        opts.italic_global = opts.stash_style_global_clumn.italic_global;
        opts.italic_dynamic = opts.stash_style_global_clumn.italic_dynamic;
    };

    //var inner_text = doc.text;
    doc.simple_text = function () {
        doc.font('ScriptNormal');
        doc.text.apply(doc, arguments);
    };
    // 缓存doc样式画了后，再恢复之前的样式
    doc.format_text = function (text: string, x: number, y: number, options: any) {
        doc.global_stash();
        doc.text2(text, x, y, 0, 0, 0, 0, 0, options);
        doc.global_pop();
    };
    doc.text2 = function (text: string, x: number, y: number, posTop: number, firstBreakHeight: number, breakHeight: number, switchPageFrom: number, switchPageTo: number, options: any): { height: number, breaks: number, switches: number } {
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
            var innersplit = split_for_formatting[i].split(new RegExp('([' + charOfStyleTag.all + '])', 'g')).filter(function (a) {
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
            if (elem === charOfStyleTag.style_global_clean) {
                doc.reset_format();
                color = options.color || 'black';

            } else if (elem === charOfStyleTag.style_global_stash) {
                doc.global_stash();
                color = options.color || 'black';

            } else if (elem === charOfStyleTag.style_global_pop) {
                doc.global_pop();
            }
            else if (elem === charOfStyleTag.style_left_stash) {
                opts.stash_style_left_clumn = {
                    bold_italic: doc.format_state.bold_italic,
                    bold: doc.format_state.bold,
                    italic: doc.format_state.italic,
                    underline: doc.format_state.underline,
                    override_color: doc.format_state.override_color,
                    italic_global: opts.italic_global,
                    italic_dynamic: opts.italic_dynamic,
                }
                doc.reset_format();
                color = options.color || 'black';

            } else if (elem === charOfStyleTag.style_left_pop) {
                doc.format_state.bold_italic = opts.stash_style_left_clumn.bold_italic;
                doc.format_state.bold = opts.stash_style_left_clumn.bold;
                doc.format_state.italic = opts.stash_style_left_clumn.italic;
                doc.format_state.underline = opts.stash_style_left_clumn.underline;
                doc.format_state.override_color = opts.stash_style_left_clumn.override_color;
                opts.italic_global = opts.stash_style_left_clumn.italic_global;
                opts.italic_dynamic = opts.stash_style_left_clumn.italic_dynamic;
            }
            else if (elem === charOfStyleTag.style_right_stash) {
                opts.stash_style_right_clumn = {
                    bold_italic: doc.format_state.bold_italic,
                    bold: doc.format_state.bold,
                    italic: doc.format_state.italic,
                    underline: doc.format_state.underline,
                    override_color: doc.format_state.override_color,
                    italic_global: opts.italic_global,
                    italic_dynamic: opts.italic_dynamic,
                }
                doc.reset_format();
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
                var oblique = undefined;
                var stroke = undefined;
                if (doc.format_state.bold_italic) {
                    if (opts.found_font_bold_italic) {
                        font = 'ScriptBoldOblique';
                    } else {
                        if (opts.found_font_italic) {
                            font = 'ScriptOblique';
                            stroke = true;
                        }
                        else if (opts.found_font_bold) {
                            font = 'ScriptBold';
                            oblique = true;
                        }
                        else {
                            oblique = true;
                            stroke = true;
                        }

                    }
                } else if (doc.format_state.bold || options.bold) {
                    if (opts.found_font_bold) {
                        font = 'ScriptBold';
                    } else {
                        stroke = true;
                    }
                } else if (doc.format_state.italic) {
                    if (opts.found_font_italic) {
                        font = 'ScriptOblique';
                    } else {
                        oblique = true;
                    }
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
                var coloer2 = doc.format_state.override_color ? doc.format_state.override_color : color

                var tobj = {
                    lineBreak: false,
                    text: elem,
                    link: linkurl,
                    font: font,
                    underline: linkurl || doc.format_state.underline,
                    color: coloer2,
                    strokeColor: coloer2,
                    oblique: oblique,
                    stroke: stroke,
                }

                textobjects.push(tobj);
            }
            currentIndex += elem.length;
            /*inner_text.call(doc, elem, x * 72, y * 72, {
                underline: doc.format_state.underline,
                lineBreak: options.line_break,
                width: options.width * 72,
                align: options.align
            });*/
        }

        let result = addTextbox(textobjects, doc, x * 72, y * 72, width * 72, posTop * 72, firstBreakHeight * 72, breakHeight * 72, switchPageFrom, switchPageTo,
            { // 组件bug,text显示宽度比实际配置的width值要大
                lineHeight: options.lineHeight || print.font_height * 72,
                lineBreak: false,
                align: options.align,
                baseline: 'top',
                fontSize: options.fontSize || print.font_size || 12,
            });
        return {
            height: result.height / 72,
            breaks: result.breaks,
            switches: result.switches,
        }

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
                doc.text2(part.text, x, y + additionalY, 0, 0, 0, 0, options);
            }
        }
    }

    return doc;
}

function clearFormatting(text: string) {
    // var clean = text.replace(/☈|↭|↯|☄|↬|☍|☋|/g, '');
    var clean = cleanStlyleChars(text);
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
    var pageIdx = 0;

    var title_token = get_title_page_token(parsed, 'title');
    var author_token = get_title_page_token(parsed, 'author');
    if (!author_token) {
        author_token = get_title_page_token(parsed, 'authors');
    }

    doc.info.Title = title_token ? clearFormatting(inline(title_token.text)) : '';
    doc.info.Author = author_token ? clearFormatting(inline(author_token.text)) : '';
    doc.info.Creator = 'betterfountain';

    // helper
    var center = function (txt: string, y: number, posTop: number, firstBreakHeight: number, breakHeight: number, switchPageFrom: number, switchPageTo: number): { height: number, breaks: number, switches: number } {
        // var txt_length = txt.replace(/\*/g, '').replace(/_/g, '').length;
        // var txt_length = get_text_display_len(clearFormatting(txt));
        // var feed = (print.page_width - txt_length * print.font_width) / 2;
        return doc.text2(txt, 0, y, posTop, firstBreakHeight, breakHeight, switchPageFrom, switchPageTo, { align: 'center' });
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

            doc.text2(tltext, print.left_margin, print.top_margin, print.top_margin, 0, 0, 0, 0, {
                width: innerwidth_third,
                align: 'left',
                links: true
            });

            //top center
            var tctext = parsed.title_page['tc'].sort(helpers.sort_index).map((x: any) => x.text).join(joinChar);
            var tctext_height = doc.heightOfString(tctext, { width: innerwidth_third * 72, align: 'center' });
            doc.text2(tctext, print.left_margin + innerwidth_third, print.top_margin, print.top_margin, 0, 0, 0, 0, {
                width: innerwidth_third,
                align: 'center',
                links: true
            });

            //top right
            var trtext = parsed.title_page['tr'].sort(helpers.sort_index).map((x: any) => x.text).join(joinChar);
            var trtext_height = doc.heightOfString(trtext, { width: innerwidth_third * 72, align: 'right' });
            doc.text2(trtext, print.left_margin + innerwidth_third + innerwidth_third, print.top_margin, print.top_margin, 0, 0, 0, 0, {
                width: innerwidth_third,
                align: 'right',
                links: true
            });

            //bottom left
            var bltext = parsed.title_page['bl'].sort(helpers.sort_index).map((x: any) => x.text).join(joinChar);
            var bltext_height = doc.heightOfString(bltext, { width: innerwidth_half * 72, align: 'left' });
            doc.text2(bltext, print.left_margin, innerheight - (bltext_height / 72), print.top_margin, 0, 0, 0, 0, {
                width: innerwidth_half,
                align: 'left',
                links: true
            });

            //bottom right
            var brtext = parsed.title_page['br'].sort(helpers.sort_index).map((x: any) => x.text).join(joinChar);
            var brtext_height = doc.heightOfString(brtext, { width: innerwidth_half * 72, align: 'right' });
            doc.text2(brtext, print.left_margin + innerwidth_half, innerheight - (brtext_height / 72), print.top_margin, 0, 0, 0, 0, {
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
            doc.text2(cctext, print.left_margin, centerStart / 72, print.top_margin, 0, 0, 0, 0, {
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
            pageIdx++;
        }


    }

    if (opts.hooks && opts.hooks.before_script) {
        opts.hooks.before_script(doc);
    }

    var height = 0, // 绘制了的高度
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

            diagonal = Math.sqrt(Math.pow(print.page_width, 2) + Math.pow(print.page_height, 2));
            diagonal -= 4;

            var spl = watermark.trim().split('\n');
            var lls = (spl.length) / 2;

            var len = 1;
            for (var i = 0; i < spl.length; i++) {
                var l = clearFormatting(spl[i]).trim().length;
                if (l > len) {
                    len = l;
                }
            }
            font_size = diagonal * 72 / len;
            if (font_size < print.font_size) {
                font_size = print.font_size
            }
            // font_size = 40;
            doc.rotate(angle, options);
            doc.format_text(watermark, 2, -(font_size * lls) / 72, {
                color: '#eeeeee',
                line_break: false,
                width: diagonal,
                align: 'center',
                fontSize: font_size,
                lineHeight: font_size
            });
            doc.rotate(-angle, options);
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

    function print_scene_split_continue(h: number) {
        if (cfg.scene_continuation_bottom) {
            var scene_continued_text = '(' + (cfg.text_scene_continued || 'CONTINUED') + ')';
            // var feed = print.action.feed + print.action.max * print.font_width - get_text_display_len(scene_continued_text) * print.font_width;
            // doc.simple_text(scene_continued_text, feed * 72, (print.top_margin + print.font_height * (y + 2)) * 72);
            doc.format_text(scene_continued_text, 0, (print.top_margin + h + print.font_height), { align: 'right', width: print.page_width - print.right_margin });

        }
    }

    function print_scene_split_top() {
        var number_y = print.font_height * 0.5 + print.page_number_top_margin;

        if (cfg.scene_continuation_top) {
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
    }


    function print_dialogue_split_more(h: number) {
        var MORE = cfg.text_more || "(MORE)";
        doc.format_text(MORE, lastCharacterFeed, (print.top_margin + h));
    }

    function print_dialogue_split_top() {
        var CONTD = cfg.text_contd || "(CONT'D)";
        doc.format_text(lastCharacter + ' ' + CONTD, lastCharacterFeed, (print.top_margin - print.font_height));
    }




    let outline = doc.outline;
    let outlineDepth = 0;
    // let previousSectionDepth = 0;

    // if (page === 0) {
    //     page++

    //     print_page_number();
    //     print_watermark();
    //     print_header_and_footer();
    // }


    let pageStarted = false;

    let currentScene: string = "";
    let currentSections: string[] = [];
    let currentDuration: number = 0;

    let notes: any[] = [];

    let last_dual_left_start_pageIdx = -1;
    let last_dual_left_start_height = 0;
    let last_dual_left_end_pageIdx = -1;
    let last_dual_left_end_height = 0;
    let last_dual_right_end_pageIdx = -1; //是否在绘制右侧对话，以及在哪一页绘制
    let last_dual_right_end_height = 0;

    let text2Result = {
        height: 0,
        breaks: 0,
        switches: 0,
    }

    let lashHeight = 0;

    let lastCharacter = "";
    let lastCharacterFeed = 0;

    function if_dual_right_end(idx: number): boolean {
        if (lines[ii].type === "page_break" || lines[idx].token && lines[idx].token.dual === "right") {
            return false;
        } else {
            if (last_dual_right_end_pageIdx >= 0) {
                if (last_dual_left_end_pageIdx < last_dual_right_end_pageIdx) {
                    pageIdx = last_dual_right_end_pageIdx;
                    height = last_dual_right_end_height;
                } else if (last_dual_left_end_pageIdx > last_dual_right_end_pageIdx) {
                    // pageIdx = last_dual_left_end_pageIdx;
                    // height = last_dual_left_end_height;
                    doc.switchToPage(pageIdx);
                } else if (last_dual_right_end_height > last_dual_left_end_height) {
                    height = last_dual_right_end_height;
                }

                last_dual_right_end_pageIdx = -1;
            }
            return true;
        }
    }


    function if_page_break(idx: number): boolean {
        if (idx >= lines.length - 1) {
            return false;
        }

        var brk = false;
        var brkNew = false;
        var line = lines[idx]
        if (line.token && line.token.dual === "right") {
            if (last_dual_right_end_height >= print.lines_per_page * print.font_height) {
                brk = true;
            }
            if (!brk) {
                if (last_dual_right_end_height > (print.lines_per_page - 2) * print.font_height) {
                    // 每页最后 1 行，遇到下一行 是以下情况，直接提前分页
                    var nextLine = lines[idx + 1];
                    if (nextLine.type === "character") {
                        brk = true;
                    }
                }
            }
            // if (!brk) {
            //     if ((line.type === "dialogue" || line.type === "parenthetical")) {
            //         if (last_dual_right_end_height > (print.lines_per_page - 2) * print.font_height) {
            //             // 每页最后 1 行，遇到下一行 是以下情况，直接提前分页
            //             // var nextLine = lines[idx + 1];
            //             // if (nextLine.type === "dialogue" || nextLine.type === "parenthetical") {
            //                 brk = true;
            //             // }
            //         }
            //     }

            // }

            if (brk) {
                lashHeight = last_dual_right_end_height;
                last_dual_right_end_pageIdx++;
                last_dual_right_end_height = 0;
                if (last_dual_right_end_pageIdx > last_dual_left_end_pageIdx) {
                    brkNew = true;
                } else {
                    doc.switchToPage(last_dual_right_end_pageIdx);
                }
            }

        } else {

            if (height >= print.lines_per_page * print.font_height) {
                brk = true;
                brkNew = true;
            }
            // TODO Arming (2024-09-28) : 提前分页的情况
            if (!brk) {
                if (height > (print.lines_per_page - 5) * print.font_height) {
                    // 每页最后 4 行，遇到下一行 是以下情况，直接提前分页
                    var nextLine = lines[idx + 1];
                    if (nextLine.type === "scene_heading" || nextLine.type === "section") {
                        brk = true;
                        brkNew = true;
                    }
                }
            }
            if (!brk) {
                if (height > (print.lines_per_page - 2) * print.font_height) {
                    // 每页最后 1 行，遇到下一行 是以下情况，直接提前分页
                    var nextLine = lines[idx + 1];
                    if (nextLine.type === "character") {
                        brk = true;
                        brkNew = true;
                    }
                }
            }
            // if (!brk) {
            //     if ((line.type === "dialogue" || line.type === "parenthetical")) {
            //         if (height > (print.lines_per_page - 2) * print.font_height) {
            //             // 每页最后 1 行，遇到下一行 是以下情况，直接提前分页
            //             // var nextLine = lines[idx + 1];
            //             // if (nextLine.type === "dialogue" || nextLine.type === "parenthetical") {
            //                 brk = true;
            //                 brkNew = true;
            //             // }
            //         }
            //     }
            // }

        }

        if (brkNew) {
            // lines 在 idx 后插入空行
            lines.splice(idx + 1, 0, {
                type: "page_break",
                token: "",
                text: "",
                start: 0,
                end: 0,
                // scene_split: false, 
            });
        }
        return brk;

    }

    for (var ii = 0; ii < lines.length; ii++) {
        // lines.forEach(function (line: any) {

        // 去除页面前面的空行
        if (!pageStarted) {
            var scene_split = false;
            if (lines[ii].type === "dialogue_fake" || lines[ii].type === "more" || lines[ii].type === "character") {
                scene_split = true;
            }
            if (lines[ii].type === "page_break" || lines[ii].text.trim().length === 0) {
                // 跳过空行
                continue;
            } else if (isBlankLineAfterStlyle(lines[ii].text)) {
                // 只含有样式字符
                // 只绘制样式，再跳过
                doc.text2(lines[ii].text, 0, 0, 0, 0, 0, 0, 0);
                continue;
            } else {
                // 当页第一个非空行
                if (lines[ii].type !== "scene_heading") {
                    scene_split = true;
                }
            }
            
            pageStarted = true;
            
            // 页面首个非空行开始

            page++
            print_page_number();
            print_watermark();
            print_header_and_footer();

            if (scene_split && lashHeight) {
                doc.switchToPage(pageIdx - 1);
                print_scene_split_continue(lashHeight);
                doc.switchToPage(pageIdx);
                print_scene_split_top();
            }
            
            if(lines[ii].type === "dialogue" || lines[ii].type === "parenthetical" ){
                doc.switchToPage(pageIdx - 1);
                print_dialogue_split_more(lashHeight);
                doc.switchToPage(pageIdx);
                print_dialogue_split_top();
            }

        }

        if_dual_right_end(ii);

        text2Result = {
            height: 0,
            breaks: 0,
            switches: 0,
        };
        let line = lines[ii];
        if (line.type === "page_break") {
            // 非页面开头的换页，页面中间出现的换页符。
            // 或者 满足 页面自动换页

            if (lineStructs) {
                if (line.token.line && !lineStructs.has(line.token.line)) {
                    lineStructs.set(line.token.line, { page: page, scene: currentScene, cumulativeDuration: currentDuration, sections: currentSections.slice(0) })
                }
            }

            if (last_dual_right_end_pageIdx >= 0) {
                // lashHeight = last_dual_right_end_height;
            } else {
                lashHeight = height;
            }
            doc.addPage();
            height = 0;
            pageIdx++;

            // page++;

            // print_page_number();
            // print_watermark();
            // print_header_and_footer();
            // prev_scene_continuation_header = '';

            pageStarted = false;
        }
        else if (line.type === "separator") {
            // 页面中间出现的空行，非页面开头的空行
            if (line.text) {
                // 绘制样式. 可能是连续块最后一行后的空行样式字符，清理样式。
                doc.text2(line.text, 0, 0, 0, 0, 0, 0, 0);
            }

            // y++;
            height += print.font_height;

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
            function wrapCharAndDialog(intput: any, lline = line): any {
                if (lline.type === "character") {
                    if (cfg.embolden_character_names) {
                        if (intput.endsWith(cfg.text_contd)) {
                            intput = intput.substring(0, intput.length - cfg.text_contd.length);
                            // intput = charOfStyleTag.bold + intput + charOfStyleTag.bold + cfg.text_contd;
                            intput = addTagAfterBrokenNote(intput, charOfStyleTag.bold) + charOfStyleTag.bold + cfg.text_contd;
                        } else {
                            // intput = charOfStyleTag.bold + intput + charOfStyleTag.bold;
                            intput = addTagAfterBrokenNote(intput, charOfStyleTag.bold) + charOfStyleTag.bold;
                        }
                    }
                    // intput = charOfStyleTag.style_global_stash + intput;
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
            function ifResetFormat(intput: any, lline = line): any {
                if (lline.type === "character" || lline.type === "scene_heading" || lline.type === "synopsis"
                    || lline.type === "centered" || lline.type === "section" || lline.type === "transition"
                    || lline.type === "lyric"
                ) {
                    if (!lline.isWrap) {
                        return addTagAfterBrokenNote(intput, charOfStyleTag.style_global_clean);
                    }
                }
                return intput;

            }
            function addTagAfterBrokenNote(intput: any, tag: string): any {
                var istart = intput.indexOf(charOfStyleTag.note_begin);
                var iend = intput.indexOf(charOfStyleTag.note_end);
                if (iend >= 0) {
                    if (istart < 0 || iend < istart) {
                        return intput.substring(0, iend + 1) + tag + intput.substring(iend + 1);
                    }
                }
                return tag + intput;
            }

            var text_properties = get_text_properties();

            if (line.type == "parenthetical" && !text.startsWith("(")) {
                text = " " + text;
            }

            if (line.type === 'centered') {
                text = ifResetFormat(text, line);
                text2Result = center(text, print.top_margin + height, print.lines_per_page * print.font_height - height, print.lines_per_page * print.font_height, print.top_margin, 0, 0);
                if (text2Result.breaks > 0) {
                    height = text2Result.height;
                } else {
                    height += text2Result.height;
                }
            } else if (line.type === "transition") {
                var feed: number = print.action.feed;
                text_properties.width = print.page_width - feed - feed;
                text_properties.align = 'right';
                text = ifResetFormat(text, line);
                text2Result = doc.text2(text, feed, print.top_margin + height, print.top_margin, print.lines_per_page * print.font_height - height, print.lines_per_page * print.font_height, text_properties, 0, 0);
                if (text2Result.breaks > 0) {
                    height = text2Result.height;
                } else {
                    height += text2Result.height;
                }
            } else {
                var feed: number = (print[line.type] || {}).feed || print.action.feed;
                text_properties.width = print.page_width - feed - feed; //对称feed
                // if (line.type === "transition") {
                //     feed = print.action.feed + print.action.max * print.font_width - get_text_display_len(line.text) * print.font_width;
                // }

                var hasInvisibleSection = (line.type === "scene_heading" && line.token.invisibleSections != undefined)
                function processSection(sectiontoken: any) {
                    let sectiontext = sectiontoken.text;
                    current_section_level = sectiontoken.level;
                    currentSections.length = sectiontoken.level - 1;

                    currentSections.push(he.encode(sectiontext));
                    if (!hasInvisibleSection) {
                        feed += current_section_level * print.section.level_indent;
                        text_properties.width = print.page_width - feed - feed; //对称feed
                    }
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
                        // text = charOfStyleTag.bold + text + charOfStyleTag.bold;
                        text = addTagAfterBrokenNote(text, charOfStyleTag.bold) + charOfStyleTag.bold;
                    }
                    if (cfg.underline_scene_headers) {
                        // text = charOfStyleTag.underline + text + charOfStyleTag.underline;
                        text = addTagAfterBrokenNote(text, charOfStyleTag.underline) + charOfStyleTag.underline;
                    }
                    // text = charOfStyleTag.style_global_stash + text;
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
                }


                if (print[line.type] && print[line.type].italic && text) {
                    // text = charOfStyleTag.italic + text + charOfStyleTag.italic;
                    text = addTagAfterBrokenNote(text, charOfStyleTag.italic) + charOfStyleTag.italic;
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
                        doc.text2(scene_number, feed - shift_scene_number, print.top_margin + height, 0, 0, 0, 0, 0, text_properties);
                    }

                    if (cfg.scenes_numbers === 'both' || cfg.scenes_numbers === 'right') {
                        shift_scene_number = (print.scene_heading.max + 1) * print.font_width;
                        doc.text2(scene_number, feed + shift_scene_number, print.top_margin + height, 0, 0, 0, 0, 0, text_properties);
                    }
                }

                var feed_diff = 0.2;
                if (line.token && line.token.dual === "right") {

                    if (line.type === "parenthetical") {
                        feed = (print.page_width / 2) + feed_diff * 2;
                        text_properties.width = print.page_width / 2 - print.action.feed - feed_diff * 3;
                    }
                    else if (line.type === "character") {
                        last_dual_left_end_pageIdx = pageIdx
                        last_dual_left_end_height = height
                        if (last_dual_left_start_pageIdx < pageIdx) {
                            doc.switchToPage(last_dual_left_start_pageIdx);
                        }
                        last_dual_right_end_pageIdx = last_dual_left_start_pageIdx;
                        last_dual_right_end_height = last_dual_left_start_height;
                        feed = (print.page_width / 2) + feed_diff * 3;
                        text_properties.width = print.page_width / 2 - print.action.feed - feed_diff * 5;

                        lastCharacter = text;
                        lastCharacterFeed = feed
                    }
                    else if (line.type === "more") {
                        feed = (print.page_width / 2) + feed_diff * 3;
                        text_properties.width = print.page_width / 2 - print.action.feed - feed_diff * 5;
                    } else {
                        feed = (print.page_width / 2) + feed_diff;
                        text_properties.width = print.page_width / 2 - print.action.feed - feed_diff;
                    }

                    text = ifResetFormat(text, line);
                    text2Result = doc.text2(text, feed, print.top_margin + last_dual_right_end_height, print.top_margin,
                        print.lines_per_page * print.font_height - last_dual_right_end_height,
                        print.lines_per_page * print.font_height,
                        last_dual_right_end_pageIdx, last_dual_left_end_pageIdx,
                        text_properties);
                    if (text2Result.breaks + text2Result.switches > 0) {
                        last_dual_right_end_pageIdx += text2Result.breaks + text2Result.switches;
                        last_dual_right_end_height = text2Result.height;
                    } else {
                        last_dual_right_end_height += text2Result.height;
                    }
                } else {
                    if (line.token && line.token.dual === "left") {
                        if (line.type === "parenthetical") {
                            feed = print.action.feed + feed_diff;
                            text_properties.width = print.page_width / 2 - print.action.feed - feed_diff * 3;
                        }
                        else if (line.type === "character") {
                            last_dual_left_start_pageIdx = pageIdx;
                            last_dual_left_start_height = height;
                            feed = print.action.feed + feed_diff * 2;
                            text_properties.width = print.page_width / 2 - print.action.feed - feed_diff * 5;

                            lastCharacter = text;
                            lastCharacterFeed = feed;
                        } else if (line.type === "more") {
                            feed = print.action.feed + feed_diff * 2;
                            text_properties.width = print.page_width / 2 - print.action.feed - feed_diff * 5;
                        } else {
                            feed = print.action.feed
                            text_properties.width = print.page_width / 2 - print.action.feed - feed_diff;
                        }
                    } else if (line.type === "character") {
                        lastCharacter = text;
                        lastCharacterFeed = feed
                    }
                    text = ifResetFormat(text, line);
                    text2Result = doc.text2(text, feed, print.top_margin + height, print.top_margin,
                        print.lines_per_page * print.font_height - height, print.lines_per_page * print.font_height, 0, 0, text_properties);
                    if (text2Result.breaks > 0) {
                        height = text2Result.height;
                    } else {
                        height += text2Result.height;
                    }
                }

                // if (line.linediff) {
                //     y += line.linediff;
                // }

            }
            // y++;
            if (lineStructs) {
                if (line.token.line && !lineStructs.has(line.token.line)) {
                    if (line.token.time) currentDuration += line.token.time;
                    lineStructs.set(line.token.line, { page: page, scene: currentScene, sections: currentSections.slice(0), cumulativeDuration: currentDuration })
                }
            }
        }

        if (pageStarted) {
            // clear after section
            if (line.type === 'section') {
                after_section = true;
            } else if (line.type === 'scene_heading') {
                after_section = false;
            }

            if (text2Result.switches > 0) {
                doc.switchToPage(last_dual_left_start_pageIdx);
                print_dialogue_split_more(print.lines_per_page * print.font_height);
                for (let j = 0; j < text2Result.switches; j++) {
                    doc.switchToPage(last_dual_left_start_pageIdx + j + 1);
                    print_dialogue_split_top();
                    if (j < text2Result.switches - 1) {
                        print_dialogue_split_more(print.lines_per_page * print.font_height);
                    }
                }
            }

            if (text2Result.breaks > 0) {
                // 自动换页，处理
                doc.switchToPage(pageIdx);
                print_scene_split_continue(print.lines_per_page * print.font_height);
                if (line.type === "dialogue" || line.type === "parenthetical") {
                    print_dialogue_split_more(print.lines_per_page * print.font_height);
                }

                for (let j = 0; j < text2Result.breaks; j++) {
                    pageIdx++;
                    page++;
                    doc.switchToPage(pageIdx);

                    print_scene_split_top();

                    print_page_number();
                    print_watermark();
                    print_header_and_footer();

                    if (line.type === "dialogue" || line.type === "parenthetical") {
                        print_dialogue_split_top();
                    }

                    if (j < text2Result.breaks - 1) {
                        print_scene_split_continue(print.lines_per_page * print.font_height);
                        if (line.type === "dialogue" || line.type === "parenthetical") {
                            print_dialogue_split_more(print.lines_per_page * print.font_height);
                        }
                    }
                }
            }

            // 是否需要提前换页：
            if_page_break(ii);
        }

    }

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