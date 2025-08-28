import * as vscode from "vscode";
import * as path from 'path';
import * as fs from "fs";
import { getEditor, getOrShowEditor, getActiveFountainDocument } from "../utils";
import { getFountainConfig } from "../configloader";
import { assetsPath, getAssetsUri, mapToObject, resolveAsUri } from "../utils";
import * as afterparser from "../afterwriting-parser";
import { GenerateDocx } from "../docx/docx";
import { DocxAsBase64 } from "../docx/docxmaker";
import { createStatisticsPanel } from "./Statistics";

interface docxpreviewPanel {
  uri: string;
  panel: vscode.WebviewPanel;
  id: Number;
}

export var docxPanels: docxpreviewPanel[] = [];

export function getDocxPreviewPanels(docuri: vscode.Uri): docxpreviewPanel[] {
  let selectedPanels: docxpreviewPanel[] = []
  for (let i = 0; i < docxPanels.length; i++) {
    if (docxPanels[i].uri == docuri.toString())
      selectedPanels.push(docxPanels[i])
  }
  return selectedPanels;
}

export function updateDocumentVersionDocxPreview(docuri: vscode.Uri, version: Number) {
  for (let panel of getDocxPreviewPanels(docuri)) {
    panel.panel.webview.postMessage({ command: 'updateversion', version: version, uri: docuri.toString() });
  }
}

export function removeDocxPreviewPanel(id: Number) {
  for (var i = docxPanels.length - 1; i >= 0; i--) {
    if (docxPanels[i].id == id) {
      docxPanels.splice(i, 1);
    }
  }
}

export async function refreshDocxPanel(docxpanel: vscode.WebviewPanel, docuri: vscode.Uri) {
  const editor = await getOrShowEditor(docuri);
  if(!editor) return;
  const config = getFountainConfig(docuri);
  
  docxpanel.webview.postMessage({ command: "updateversion", version: editor.document.version, loading: true, uri: editor.document.uri.toString() });
  var parsed = afterparser.parse(editor.document.getText(), config, false);
  //Create PDF
  let docxAsBase64: DocxAsBase64 = await GenerateDocx("$PREVIEW$", config, undefined, parsed, undefined);
  let linemap = JSON.stringify(mapToObject(docxAsBase64.stats.linemap));
  let pagecount = docxAsBase64.stats.pagecount;
  docxpanel.webview.postMessage({ command: "updatedocx", version: editor.document.version, content: docxAsBase64.data, linemap: linemap, pagecount: pagecount })
  //Post Update to panel
}

export function createDocxPreviewPanel(): vscode.WebviewPanel {
  let editor = getEditor(getActiveFountainDocument());
  if (!editor || editor.document.languageId != "fountain") {
    vscode.window.showErrorMessage("You can only view the Docx Preview of Fountain documents!");
    return undefined;
  }
  let docxpanel: vscode.WebviewPanel;
  let presentdocxPanels = getDocxPreviewPanels(editor.document.uri);
  presentdocxPanels.forEach(p => {
    if (p.uri == editor.document.uri.toString()) {
      //The docx panel already exists
      p.panel.reveal();
      docxpanel = p.panel;
    }
  });

  if (docxpanel == undefined) {
    //The docx panel didn't already exist
    var panelname = path.basename(editor.document.fileName).replace(".fountain", "");
    docxpanel = vscode.window.createWebviewPanel(
      'fountain-docxpreview', // Identifies the type of the webview. Used internally
      panelname, // Title of the panel displayed to the user
      vscode.ViewColumn.Two, // Editor column to show the new webview panel in.
      { enableScripts: true });
    docxpanel.iconPath = getAssetsUri("file-docx");
  }
  loadWebView(editor.document.uri, docxpanel);
  return docxpanel;
}

let docxHtml: string | null = null;
function loadDocxPreviewHtml() {
  if (!docxHtml) docxHtml = fs.readFileSync(assetsPath() + path.sep + "webviews" + path.sep + "preview_docx.html", 'utf8');
  return docxHtml;
}

async function loadWebView(docuri: vscode.Uri, docxpanel: vscode.WebviewPanel) {
  let id = Date.now() + Math.floor((Math.random() * 1000));
  docxPanels.push({ uri: docuri.toString(), panel: docxpanel, id: id });
  docxpanel.webview.html = loadDocxPreviewHtml().replace("$HEADLINKS$",
    `
    <link rel="stylesheet" href="${resolveAsUri(docxpanel, 'out', 'webviews', 'common.css')}">
    <link rel="stylesheet" href="${resolveAsUri(docxpanel, 'node_modules', '@vscode/codicons', 'dist', 'codicon.css')}">
    <script src="${resolveAsUri(docxpanel, 'out', 'webviews', 'docx-preview', 'dist', 'docx-preview.js')}"></script>`);

  let config = getFountainConfig(docuri);
  docxpanel.webview.postMessage({ command: 'setstate', uri: docuri.toString() });
  docxpanel.webview.postMessage({ command: 'updateconfig', content: config });

  docxpanel.webview.onDidReceiveMessage(async message => {
    if (message.command == "revealLine") {
      const sourceLine = message.content;
      let editor = getEditor(vscode.Uri.parse(message.uri));
      if (editor == undefined) {
        var doc = await vscode.workspace.openTextDocument(vscode.Uri.parse(message.uri));
        editor = await vscode.window.showTextDocument(doc)
      }
      else {
        await vscode.window.showTextDocument(editor.document, editor.viewColumn, false);
      }
      if (editor && !Number.isNaN(sourceLine)) {
        editor.selection = new vscode.Selection(new vscode.Position(sourceLine, 0), new vscode.Position(sourceLine, 0));
        editor.revealRange(
          new vscode.Range(sourceLine, 0, sourceLine + 1, 0),
          vscode.TextEditorRevealType.Default);
      }
    }
    if (message.command == "selectLines") {
      let startline = Math.floor(message.content.start);
      let endline = Math.floor(message.content.end);
      let editor = getEditor(vscode.Uri.parse(message.uri));
      if (editor == undefined) {
        var doc = await vscode.workspace.openTextDocument(vscode.Uri.parse(message.uri));
        editor = await vscode.window.showTextDocument(doc)
      }
      else {
        await vscode.window.showTextDocument(editor.document, editor.viewColumn, false);
      }
      if (editor && !Number.isNaN(startline) && !Number.isNaN(endline)) {
        let startpos = new vscode.Position(startline, 0);
        let endpos = new vscode.Position(endline, editor.document.lineAt(endline).text.length);
        editor.selection = new vscode.Selection(startpos, endpos);
        editor.revealRange(new vscode.Range(startpos, endpos), vscode.TextEditorRevealType.Default);
        vscode.window.showTextDocument(editor.document);
      }
    }
    if (message.command == "saveUiPersistence") {
      //save ui persistence
    }
    if (message.command == "refresh") {
      refreshDocxPanel(docxpanel, docuri);
    }
    if (message.command == "openstats") {
      createStatisticsPanel(docuri);
    }
  });
   docxpanel.onDidChangeViewState(() => {
      if (docxpanel.active) {
        refreshDocxPanel(docxpanel, docuri);
      }
    });
  docxpanel.onDidDispose(() => {
    removeDocxPreviewPanel(id);
  })
  refreshDocxPanel(docxpanel, docuri);
}

vscode.workspace.onDidChangeConfiguration(change => {
  if (change.affectsConfiguration("fountain")) {
    docxPanels.forEach(p => {
      var config = getFountainConfig(vscode.Uri.parse(p.uri));
      p.panel.webview.postMessage({ command: 'updateconfig', content: config })
      p.panel.webview.postMessage({ command: 'updateversion', version: -1, uri: p.uri });
    });
  }
})

let previousCaretLine = 0;
let previousSelectionStart = 0;
let previousSelectionEnd = 0;
vscode.window.onDidChangeTextEditorSelection(change => {
  if (change.textEditor.document.languageId !== "fountain") return;
    var selection = change.selections[0];
  docxPanels.forEach(p => {
    if (p.uri == change.textEditor.document.uri.toString()) {
      if (selection.active.line != previousCaretLine) {
        previousCaretLine = selection.active.line;
        p.panel.webview.postMessage({ command: 'updatecaret', content: selection.active.line, linescount: change.textEditor.document.lineCount, source: "click" });
      }
      if (previousSelectionStart != selection.start.line || previousSelectionEnd != selection.end.line) {
        previousSelectionStart = selection.start.line;
        previousSelectionEnd = selection.end.line;
        p.panel.webview.postMessage({ command: 'updateselection', content: { start: selection.start.line, end: selection.end.line } });
      }

    }
  });
})

export class FountainDocxPanelserializer implements vscode.WebviewPanelSerializer {
  async deserializeWebviewPanel(webviewPanel: vscode.WebviewPanel, state: any) {
    // `state` is the state persisted using `setState` inside the webview

    // Restore the content of our webview.
    //
    // Make sure we hold on to the `webviewPanel` passed in here and
    // also restore any event listeners we need on it.


    let docuri = vscode.Uri.parse(state.docuri);
    loadWebView(docuri, webviewPanel);
    //webviewPanel.webview.postMessage({ command: 'updateTitle', content: state.title_html });
    //webviewPanel.webview.postMessage({ command: 'updateScript', content: state.screenplay_html });
  }
}