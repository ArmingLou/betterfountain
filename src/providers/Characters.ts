import * as vscode from 'vscode';
import { activeParsedDocument } from '../extension';
import { FSFormat } from '../utils/format';
import { SceneTreeItem } from './Scene';

export class FountainCharacterTreeDataProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  public readonly onDidChangeTreeDataEmitter: vscode.EventEmitter<vscode.TreeItem | null> =
    new vscode.EventEmitter<vscode.TreeItem | null>();
  public readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | null> = this.onDidChangeTreeDataEmitter.event;

  private treeRoot: CharacterTreeItem;

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
    return element;
  }

  getChildren(element?: CharacterTreeItem): vscode.ProviderResult<vscode.TreeItem[]> {
    if (element) {
      return element.children;
    }
    if (this.treeRoot && this.treeRoot.children) {
      return this.treeRoot.children;
    } else {
      return []
    }
  }

  update(): void {
    this.treeRoot = buildCharacterTree();
    this.onDidChangeTreeDataEmitter.fire(void 0);
  }
}

function buildCharacterTree(): CharacterTreeItem {
  const root = new CharacterTreeItem("Characters", [], null);
  root.children = [];

  const doc = activeParsedDocument();
  if (doc) {
    const characters = doc.properties.characters;
    for (const [character, scenes] of characters.entries()) {
      const child = new CharacterTreeItem(FSFormat.nameToNatural(character), scenes, root);
      root.children.push(child);
    }
  }
  return root;
}

class CharacterTreeItem extends vscode.TreeItem {
  children: vscode.TreeItem[] = [];

  constructor(label: string, public scenes: number[], public parent: CharacterTreeItem) {
    super(label, vscode.TreeItemCollapsibleState.Collapsed);
    var tot = 0;
    const doc = activeParsedDocument();
    if (doc) {
      for (const scene of scenes) {
        if (scene < 0) {
          continue;
        }
        tot += 1;
        const properties = doc.properties;
        const sceneName = properties.sceneNames[scene];
        const sceneLineNumber = properties.sceneLines[scene];
        this.children.push(new SceneTreeItem(sceneName, sceneLineNumber, this));
      }
    }
    this.description = `${tot} scenes`;
  }
}

export class CharacterDefinitionProvider implements vscode.DefinitionProvider {
  provideDefinition(document: vscode.TextDocument, position: vscode.Position): vscode.Definition {
    const doc = activeParsedDocument();
    if (!doc) return null;

    // if(!doc.properties.characterLines.has(position.line)) {
    //   return null;
    // }

    const lineText = document.lineAt(position.line).text;
    for (const [name, sceneIdxs] of doc.properties.characters) {
      if (lineText.includes(name)) {
        var st = lineText.indexOf(name);
        var en = st + name.length;
        if (position.character < st || position.character > en) {
          return null;
        }

        var res = sceneIdxs.filter(idx => idx >= 0).map(idx => {
          const sceneLineNumber = doc.properties.sceneLines[idx];
          return new vscode.Location(
            document.uri,
            new vscode.Position(sceneLineNumber, 0)
          )
        });
        if (doc.properties.characterFirstLine.has(name)) {
          const firstLine = doc.properties.characterFirstLine.get(name);
          if (firstLine !== position.line) {
            var minidx = Math.min(...sceneIdxs.filter(idx => idx >= 0));
            var minLine = doc.properties.sceneLines[minidx];
            if (firstLine < minLine) {
              // 放在res的前面
              res.unshift(new vscode.Location(
                document.uri,
                new vscode.Position(firstLine, 0)
              ));
            }
          }
        }
        return res.length > 0 ? res : null;
      }
    }
    return null;
  }
}

export class CharacterReferenceProvider implements vscode.ReferenceProvider {
  provideReferences(document: vscode.TextDocument, position: vscode.Position, _context: vscode.ReferenceContext): vscode.ProviderResult<vscode.Location[]> {
    const doc = activeParsedDocument();
    if (!doc) return null;

    // if(!doc.properties.characterLines.has(position.line)) {
    //   return null;
    // }

    const lineText = document.lineAt(position.line).text;

    for (const [name, sceneIdxs] of doc.properties.characters) {
      if (lineText.includes(name)) {
        var st = lineText.indexOf(name);
        var en = st + name.length;
        if (position.character < st || position.character > en) {
          return null;
        }
        return sceneIdxs.filter(idx => idx >= 0).map(idx => {
          const sceneLineNumber = doc.properties.sceneLines[idx];
          return new vscode.Location(
            document.uri,
            new vscode.Position(sceneLineNumber, 0)
          )
        });
      }
    }

    return null;
  }
}