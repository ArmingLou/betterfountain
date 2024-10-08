import * as vscode from 'vscode';

export class FountainConfig{
    calculate_duration: number;
    calculate_duration_long: number;
    calculate_duration_short: number;
    calculate_duration_action: number;
    dialogue_foldable: boolean;
    refresh_stats_on_save: boolean;
    refresh_pdfpreview_on_save:boolean;
    number_scenes_on_save: boolean;
    embolden_scene_headers:boolean;
    embolden_character_names:boolean;
    emitalic_dialog:boolean;
    show_page_numbers:string;
    split_dialogue:boolean;
    print_title_page:boolean;
    print_profile:string;
    double_space_between_scenes:boolean;
    print_sections:boolean;
    print_synopsis:boolean;
    print_actions:boolean;
    print_headers:boolean;
    print_dialogues:boolean;
    number_sections:boolean;
    use_dual_dialogue:boolean;
    print_notes:boolean;
    note_position_bottom:boolean;
    text_note:string;
    print_header:string;
    print_footer:string;
    print_watermark:string;
    scenes_numbers:string;
    each_scene_on_new_page:boolean;
    merge_empty_lines:boolean;
    print_dialogue_numbers:boolean;
    create_bookmarks:boolean;
    invisible_section_bookmarks:boolean;
    synchronized_markup_and_preview:boolean;
    preview_theme:string;
    preview_texture:boolean;
    text_more:string;
    text_contd:string;
    text_scene_continued:string;
    scene_continuation_top:boolean;
    scene_continuation_bottom:boolean;
    parenthetical_newline_helper:boolean;
}

export class ExportConfig {
    highlighted_characters: Array<String>;
}

export type FountainUIPersistence = {
    [key: string]: any,
    outline_visibleSynopses:boolean,
    outline_visibleNotes:boolean
    outline_visibleSections:boolean;
    outline_visibleScenes:boolean;
    outline_visibleDialogue:boolean;
}
export let uiPersistence:FountainUIPersistence = {
    outline_visibleSynopses: true,
    outline_visibleNotes: true,
    outline_visibleScenes: true,
    outline_visibleSections: true,
    outline_visibleDialogue: true
}

let extensionContext:vscode.ExtensionContext = undefined;
export var initFountainUIPersistence = function(context:vscode.ExtensionContext){
    extensionContext = context;
    context.globalState.keys().forEach((k)=>{
        var v = context.globalState.get(k);
        if(v != undefined){
            uiPersistence[k] = v;
        }
    });
    for(const k in uiPersistence){
        vscode.commands.executeCommand('setContext', 'fountain.uipersistence.'+k, uiPersistence[k]);
    }
}

export var changeFountainUIPersistence = function(key:"outline_visibleSynopses"|"outline_visibleNotes"|"outline_visibleSections"|"outline_visibleScenes"|"outline_visibleDialogue", value:any){
    if(extensionContext){
        extensionContext.globalState.update(key, value);
        uiPersistence[key] = value;
        vscode.commands.executeCommand('setContext', 'fountain.uipersistence.'+key, value);
    }
}

const configMap = new Map<string, FountainConfig>();

export var cleanFountainConfig = function(){
    configMap.clear();
}

export var getFountainConfig = function(docuri:vscode.Uri):FountainConfig{
    let uriStr = '';
    if(!docuri && vscode.window.activeTextEditor != undefined) 
        docuri = vscode.window.activeTextEditor.document.uri;

    if(docuri){
        uriStr = docuri.toString();
    }

    if(configMap.has(uriStr)){
        return configMap.get(uriStr);
    }
    
    var pdfConfig = vscode.workspace.getConfiguration("fountain.pdf", docuri);
    var generalConfig = vscode.workspace.getConfiguration("fountain.general", docuri);
    const res = {
        calculate_duration: generalConfig.calculateDuration,
        calculate_duration_long: generalConfig.calculateDurationLong,
        calculate_duration_short: generalConfig.calculateDurationShort,
        calculate_duration_action: generalConfig.calculateDurationAction,
        dialogue_foldable: generalConfig.dialogueFoldable,
        number_scenes_on_save: generalConfig.numberScenesOnSave,
        refresh_stats_on_save: generalConfig.refreshStatisticsOnSave,
        refresh_pdfpreview_on_save: generalConfig.refreshPdfPreviewOnSave,
        embolden_scene_headers: pdfConfig.emboldenSceneHeaders,
        embolden_character_names: pdfConfig.emboldenCharacterNames,
        emitalic_dialog: pdfConfig.emitalicDialog,
        show_page_numbers: pdfConfig.showPageNumbers,
        split_dialogue: pdfConfig.splitDialog,
        print_title_page: pdfConfig.printTitlePage,
        print_profile: pdfConfig.printProfile,
        double_space_between_scenes: pdfConfig.doubleSpaceBetweenScenes,
        print_sections: pdfConfig.printSections,
        print_synopsis: pdfConfig.printSynopsis,
        print_actions: pdfConfig.printActions,
        print_headers: pdfConfig.printHeaders,
        print_dialogues: pdfConfig.printDialogues,
        number_sections: pdfConfig.numberSections,
        use_dual_dialogue: pdfConfig.useDualDialogue,
        print_notes: pdfConfig.printNotes,
        note_position_bottom: pdfConfig.notePositionBottom,
        text_note: pdfConfig.textNote,
        print_header: pdfConfig.pageHeader,
        print_footer: pdfConfig.pageFooter,
        print_watermark: pdfConfig.watermark,
        scenes_numbers: pdfConfig.sceneNumbers,
        each_scene_on_new_page: pdfConfig.eachSceneOnNewPage,
        merge_empty_lines: pdfConfig.mergeEmptyLines,
        print_dialogue_numbers: pdfConfig.showDialogueNumbers,
        create_bookmarks: pdfConfig.createBookmarks,
        invisible_section_bookmarks: pdfConfig.invisibleSectionBookmarks,
        text_more: pdfConfig.textMORE,
        text_contd: pdfConfig.textCONTD,
        text_scene_continued: pdfConfig.textSceneContinued,
        scene_continuation_top: pdfConfig.sceneContinuationTop,
        scene_continuation_bottom: pdfConfig.sceneContinuationBottom,
        synchronized_markup_and_preview: generalConfig.synchronizedMarkupAndPreview,
        preview_theme: generalConfig.previewTheme,
        preview_texture: generalConfig.previewTexture,
        parenthetical_newline_helper:  generalConfig.parentheticalNewLineHelper
    }
    configMap.set(uriStr, res);
    return res;
}
