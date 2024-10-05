import * as pdfmaker from "./pdfmaker";
import * as print from "./print";
import { FountainConfig, ExportConfig } from "../configloader";
import * as helpers from "../helpers";
import * as fliner from "./liner";
import * as vscode from "vscode";

//Creates the PDF, or returns stats if output path is "$STATS$"
export var GeneratePdf = async function (outputpath: string, config: FountainConfig, exportconfig: ExportConfig, parsedDocument: any, progress?: vscode.Progress<{ message?: string; increment?: number; }>): Promise<any> {

    if (progress) progress.report({ message: "Converting to individual lines", increment: 25 });
    var liner: any = new fliner.Liner(helpers.default, config.print_dialogue_numbers);
    var watermark = undefined;
    var header = undefined;
    var footer = undefined;
    var font = "Courier Prime";
    var font_bold = "";
    var font_italic = "";
    var font_bold_italic = "";
    var metadata = undefined;
    if (parsedDocument.title_page) {
        for (let index = 0; index < parsedDocument.title_page['hidden'].length; index++) {
            if (parsedDocument.title_page['hidden'][index].type == "watermark")
                watermark = parsedDocument.title_page['hidden'][index].text;
            if (parsedDocument.title_page['hidden'][index].type == "header")
                header = parsedDocument.title_page['hidden'][index].text;
            if (parsedDocument.title_page['hidden'][index].type == "footer")
                footer = parsedDocument.title_page['hidden'][index].text;
            if (parsedDocument.title_page['hidden'][index].type == "font")
                font = parsedDocument.title_page['hidden'][index].text;
            if (parsedDocument.title_page['hidden'][index].type == "font_italic")
                font_italic = parsedDocument.title_page['hidden'][index].text;
            if (parsedDocument.title_page['hidden'][index].type == "font_bold")
                font_bold = parsedDocument.title_page['hidden'][index].text;
            if (parsedDocument.title_page['hidden'][index].type == "font_bold_italic")
                font_bold_italic = parsedDocument.title_page['hidden'][index].text;
            if (parsedDocument.title_page['hidden'][index].type == "metadata") {
                var metadataString = parsedDocument.title_page['hidden'][index].text;
                if (metadataString) {
                    try {
                        metadata = JSON.parse(metadataString);
                    } catch (e) {
                        metadata = undefined;
                    }
                }
            }
        }
    }
    var current_index = 0, previous_type: string = null;

    // tidy up separators
    let invisibleSections = [];
    while (current_index < parsedDocument.tokens.length) {
        var current_token = parsedDocument.tokens[current_index];

        if (current_token.type == "dual_dialogue_begin" || current_token.type == "dialogue_begin" || current_token.type == "dialogue_end" || current_token.type == "dual_dialogue_end" ||
            (!config.print_actions && current_token.is("action", "transition", "centered", "shot")) ||
            (!config.print_notes && current_token.type === "note") ||
            (!config.print_headers && current_token.type === "scene_heading") ||
            (!config.print_sections && current_token.type === "section") ||
            (!config.print_synopsis && current_token.type === "synopsis") ||
            (!config.print_dialogues && current_token.is_dialogue()) ||
            (config.merge_empty_lines && current_token.is("separator") && previous_type === "separator")) {

            if (current_token.type == "section") {
                //on the next scene header, add an invisible section (for keeping track of sections when creating bookmarks and generating pdf-side)
                invisibleSections.push(current_token);
            }
            parsedDocument.tokens.splice(current_index, 1);

            continue;
        }
        if (current_token.type == "scene_heading") {
            if (invisibleSections.length > 0)
                current_token.invisibleSections = invisibleSections;
            invisibleSections = [];
        }

        if (config.double_space_between_scenes && current_token.is("scene_heading") && current_token.number !== 1) {
            var additional_separator = helpers.default.create_separator(parsedDocument.tokens[current_index].start, parsedDocument.tokens[current_index].end);
            parsedDocument.tokens.splice(current_index, 0, additional_separator);
            current_index++;
        }
        previous_type = current_token.type;
        current_index++;
    }

    // clean separators at the end
    while (parsedDocument.tokens.length > 0 && parsedDocument.tokens[parsedDocument.tokens.length - 1].type === "separator") {
        parsedDocument.tokens.pop();
    }

    // if (watermark == undefined || header == undefined || footer == undefined) {
    //     cleanFountainConfig();
    //     getFountainConfig(getActiveFountainDocument());
    //     var pdfConfig = vscode.workspace.getConfiguration("fountain.pdf");
    // }
    if (watermark != undefined) {
        config.print_watermark = watermark;
    } else {
        config.print_watermark = vscode.workspace.getConfiguration("fountain.pdf").get("watermark");
    }
    if (header != undefined) {
        config.print_header = header;
    } else {
        config.print_header = vscode.workspace.getConfiguration("fountain.pdf").get("pageHeader");
    }
    if (footer != undefined) {
        config.print_footer = footer;
    } else {
        config.print_footer = vscode.workspace.getConfiguration("fountain.pdf").get("pageFooter");
    }


    parsedDocument.lines = await liner.line2(parsedDocument.tokens, {
        print: print.print_profiles[config.print_profile || "a4"],
        text_more: config.text_more,
        text_contd: config.text_contd,
        split_dialogue: config.split_dialogue,
        font: font,
        merge_empty_lines: config.merge_empty_lines
    });

    var pdf_options: pdfmaker.Options = {
        filepath: outputpath,
        parsed: parsedDocument,
        print: print.print_profiles[config.print_profile || "a4"],
        config: config,
        font: font,
        exportconfig: exportconfig,
        font_italic: font_italic,
        font_bold: font_bold,
        font_bold_italic: font_bold_italic,
        metadata: metadata,
        stash_style_left_clumn: {
            bold_italic: false,
            bold: false,
            italic: false,
            underline: false,
            override_color: "",
            italic_global: false,
            italic_dynamic: false
        },
        stash_style_right_clumn: {
            bold_italic: false,
            bold: false,
            italic: false,
            underline: false,
            override_color: "",
            italic_global: false,
            italic_dynamic: false
        },
        stash_style_global_clumn: {
            bold_italic: false,
            bold: false,
            italic: false,
            underline: false,
            override_color: "",
            italic_global: false,
            italic_dynamic: false
        },
        italic_global: false,
        italic_dynamic: false,
        found_font_italic: false,
        found_font_bold: false,
        found_font_bold_italic: false,
    }

    if (outputpath == "$STATS$")
        return pdfmaker.get_pdf_stats(pdf_options);
    else if (outputpath == "$PREVIEW$")
        return pdfmaker.get_pdf_base64(pdf_options)
    else
        pdfmaker.get_pdf(pdf_options, progress);
}
