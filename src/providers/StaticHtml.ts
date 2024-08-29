import { getFountainConfig } from "../configloader";
import { getActiveFountainDocument, getEditor } from "../utils";
import * as afterparser from "../afterwriting-parser";
import { fileToBase64, openFile, revealFile } from "../utils";
import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

export async function exportHtml(){
	let editor = getEditor(getActiveFountainDocument());
	var filename = editor.document.fileName.replace(/(\.(((better)?fountain)|spmd|txt))$/, '');
	var saveuri = vscode.Uri.file(filename);
	let filepath = await vscode.window.showSaveDialog(
			{
				filters: { "HTML File": ["html"] },
				defaultUri: saveuri
			});
    var fountainconfig = getFountainConfig(editor.document.uri);
	var output = afterparser.parse(editor.document.getText(), fountainconfig , true);

    let extensionpath = vscode.extensions.getExtension("Arming.betterfountain").extensionPath;
    let htmlpath = path.join(extensionpath, 'assets', 'staticexport.html');
	var rawhtml =  fs.readFileSync(htmlpath, 'utf8');

    if(process.platform != "win32"){
        rawhtml = rawhtml.replace(/\r\n/g, "\n");
    }

    var pageClasses = "innerpage";
    if (fountainconfig.scenes_numbers == "left")
        pageClasses = "innerpage numberonleft";
    else if (fountainconfig.scenes_numbers == "right")
        pageClasses = "innerpage numberonright";
    else if (fountainconfig.scenes_numbers == "both")
        pageClasses = "innerpage numberonleft numberonright";

    rawhtml = rawhtml.replace("$SCRIPTCLASS$", pageClasses);

    let courierprimeB64 = fileToBase64(path.join(extensionpath, 'out', 'courierprime', 'courier-prime.ttf'));
    let courierprimeB64_bold = fileToBase64(path.join(extensionpath, 'out', 'courierprime', 'courier-prime-bold.ttf'));
    let courierprimeB64_italic = fileToBase64(path.join(extensionpath, 'out', 'courierprime', 'courier-prime-italic.ttf'));
    let courierprimeB64_bolditalic = fileToBase64(path.join(extensionpath, 'out', 'courierprime', 'courier-prime-bold-italic.ttf'));

    rawhtml = rawhtml.replace("$COURIERPRIME$", courierprimeB64)
                     .replace("$COURIERPRIME-BOLD$", courierprimeB64_bold)
                     .replace("$COURIERPRIME-ITALIC$", courierprimeB64_italic)
                     .replace("$COURIERPRIME-BOLDITALIC$", courierprimeB64_bolditalic);

    if(output.titleHtml){
        rawhtml = rawhtml.replace("$TITLEPAGE$", output.titleHtml);
    }
    else{
        rawhtml = rawhtml.replace("$TITLEDISPLAY$", "hidden")
    }
    rawhtml = rawhtml.replace("$SCREENPLAY$", output.scriptHtml);
	vscode.workspace.fs.writeFile(filepath, Buffer.from(rawhtml)).then(()=>{
        let open = "Open";
        let reveal = "Reveal in File Explorer";
        if(process.platform == "darwin") reveal = "Reveal in Finder"
        vscode.window.showInformationMessage("Exported HTML Succesfully!", open, reveal).then(val=>{
            switch(val){
                case open:{
                    openFile(filepath.fsPath);
                    break;
                }
                case reveal:{
                    revealFile(filepath.fsPath);
                    break;
                }
            }
        })
    }, (err)=>{
        vscode.window.showErrorMessage("Failed to export HTML: " + err.message);
    });
}