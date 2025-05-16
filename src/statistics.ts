import { parseoutput, regex, StructToken } from "./afterwriting-parser"
import { GeneratePdf } from "./pdf/pdf"
import { ExportConfig, FountainConfig } from "./configloader"
import { pdfstats } from "./pdf/pdfmaker"
import { calculateDialogueDuration, isMonologue, rgbToHex, wordToColor, median, mapToObject, calculateChars, getDialogueVaildPounchCount } from "./utils"
import readabilityScores = require("readability-scores")

type dialoguePiece = {
    character: string
    speech: string
}

interface dialoguePerCharacter {
    [x: string]: string[]
}

type locationStatisticPerLocation = {
    name: string,
    scene_numbers: string[],
    times_of_day: string[],
    color: string,
};

type dialogueStatisticPerCharacter = {
    name: string
    speakingParts: number
    wordsSpoken: number,
    secondsSpoken: number,
    averageComplexity: number,
    monologues: number,
    number_of_scenes: number,
    color: string
}

type singleSceneStatistic = {
    title: string
}

type lengthStatistics = {
    characters: number
    characterswithoutwhitespace: number;
    lines: number,
    lineswithoutwhitespace: number;
    words: number;
    pages: number;
    pagesreal: number;
    scenes: number;
    lines_first_scene: number;
}

type lengthchartitem = {
    line: number,
    playTimeSec: number,
    scene: string,
    length: number
}

type dialoguechartitem = {
    line: number,
    playTimeSec: number,
    scene: string,
    lengthTimeGlobal: number,
    lengthWordsGlobal: number,
    monologue: boolean,
    lengthTime: number,
    lengthWords: number
}
type sceneitem = {
    line: number,
    endline: number,
    scene: string,
    type: 'int' | 'ext' | 'ie' | 'unknown',
    time: string
}

type durationByProp = {
    prop: string;
    duration: number;
}

type durationStatistics = {
    dialogue: number
    action: number
    total: number,
    lengthchart_action: lengthchartitem[],
    lengthchart_dialogue: lengthchartitem[],
    durationBySceneProp: durationByProp[],
    characters: dialoguechartitem[][],
    scenes: sceneitem[],
    characternames: string[],
    monologues: number
}

type locationStatistics = {
    locations: locationStatisticPerLocation[],
    locationsCount: number
}

type characterStatistics = {
    characters: dialogueStatisticPerCharacter[],
    complexity: number,
    characterCount: number,
    monologues: number,
}

type sceneStatistics = {
    scenes: singleSceneStatistic[],
}

type screenPlayStatistics = {
    characterStats: characterStatistics,
    locationStats: locationStatistics,
    sceneStats: sceneStatistics,
    lengthStats: lengthStatistics
    durationStats: durationStatistics
    pdfmap: string
    structure: StructToken[]
}

function age(value: number) {
    var max = 22
    return value > max ? max : value
}
function gradeToAge(grade: number) {
    return age(Math.round(grade + 5))
}

const createCharacterStatistics = (parsed: parseoutput): characterStatistics => {
    const dialoguePieces: dialoguePiece[] = [];

    var fisrtScenceStared = false;

    for (var i = 0; i < parsed.tokens.length; i++) {
        if (parsed.tokens[i].type === "scene_heading") {
            fisrtScenceStared = true; //第一个场景之前的角色，不统计。
        }
        while (i < parsed.tokens.length && parsed.tokens[i].type === "character" && fisrtScenceStared) {
            const character = parsed.tokens[i].name()
            var speech = "";
            while (i++ && i < parsed.tokens.length) {
                if (parsed.tokens[i].type === "dialogue") {
                    // speech += parsed.tokens[i].text + " " 
                    speech += parsed.tokens[i].textNoNotes + " "
                }
                else if (parsed.tokens[i].type === "character") {
                    break;
                }
                // else skip extensions / parenthesis / dialogue-begin/-end
            }

            speech = speech.trim();
            dialoguePieces.push({
                character,
                speech
            });
        }
    }

    const dialoguePerCharacter: dialoguePerCharacter = {}

    dialoguePieces.forEach((dialoguePiece) => {
        if (dialoguePerCharacter.hasOwnProperty(dialoguePiece.character)) {
            dialoguePerCharacter[dialoguePiece.character].push(dialoguePiece.speech)
        } else {
            dialoguePerCharacter[dialoguePiece.character] = [dialoguePiece.speech]
        }
    })

    const characterStats: dialogueStatisticPerCharacter[] = []
    let speechcomplexityArray: number[] = [];
    let monologueCounter = 0;

    Object.keys(dialoguePerCharacter).forEach((singledialPerChar: string) => {
        const speakingParts = dialoguePerCharacter[singledialPerChar].length;
        let averageComplexity = 0;
        let secondsSpoken = 0;
        let monologues = 0;
        let combinedSentences = "";
        const allDialogueCombined = dialoguePerCharacter[singledialPerChar].reduce((prev, curr) => {
            let time = calculateDialogueDuration(curr, parsed.dial_sec_per_char, parsed.dial_sec_per_punc_short, parsed.dial_sec_per_punc_long);
            secondsSpoken += time;
            combinedSentences += "." + curr;
            if (isMonologue(time)) monologues++;
            return `${prev} ${curr} `;
        }, "");
        monologueCounter += monologues;
        var readability = readabilityScores(combinedSentences);
        if (readability) {
            averageComplexity = (
                gradeToAge(readability.daleChall) +
                gradeToAge(readability.ari) +
                gradeToAge(readability.colemanLiau) +
                gradeToAge(readability.fleschKincaid) +
                gradeToAge(readability.smog) +
                gradeToAge(readability.gunningFog)) / 6;
            if (averageComplexity > 0) speechcomplexityArray.push(averageComplexity);
        }
        // const wordsSpoken = getCharacterCountWithoutWhitespace(allDialogueCombined);
        const wordsSpoken = calculateChars(allDialogueCombined).length + getDialogueVaildPounchCount(allDialogueCombined);
        characterStats.push({
            name: singledialPerChar,
            color: rgbToHex(wordToColor(singledialPerChar)),
            speakingParts,
            secondsSpoken,
            averageComplexity,
            monologues,
            wordsSpoken,
            number_of_scenes: parsed.properties.characterSceneNumber.get(singledialPerChar).size,
        })
    })

    characterStats.sort((a, b) => {
        // by parts
        if (b.speakingParts > a.speakingParts) return +1;
        if (b.speakingParts < a.speakingParts) return -1;
        // then by words
        if (b.wordsSpoken > a.wordsSpoken) return +1;
        if (b.wordsSpoken < a.wordsSpoken) return -1;
        return 0;
    })

    return {
        characters: characterStats, // 包含各个角色的统计信息，用在统计面板>角色>底部表格
        complexity: median(speechcomplexityArray),
        characterCount: characterStats.length,
        monologues: monologueCounter
    }
}

const createLocationStatistics = (parsed: parseoutput): locationStatistics => {
    const locationSlugs = [...parsed.properties.locations.keys()];
    return {
        locationsCount: locationSlugs.length,
        locations: locationSlugs.map((location_slug: string) => {
            const references = parsed.properties.locations.get(location_slug);
            const times_of_day = references
                .map(it => locationtime(it.time_of_day))
                .filter((v, i, a) => a.indexOf(v) === i);
            const i_e = references.some(it => it.interior && it.exterior); // 此地点 ，有内外景
            const interior = references.some(it => it.interior && !it.exterior); // 此地点，有内景
            const exterior = references.some(it => it.exterior && !it.interior); // 此地点，有外景
            let interior_exterior = 'unknown'; // 不确定什么景. 只有 地点的表格有 unknown
            let i = 0;
            if (i_e) {
                i++;
                interior_exterior = 'int-ext'
            }
            if (interior) {
                i++;
                interior_exterior = 'int'
            }
            if (exterior) {
                i++;
                interior_exterior = 'ext'
            }
            if (i > 1) {
                interior_exterior = 'multiple' // 混合景，存在 多个景
            }
            return {
                color: rgbToHex(wordToColor(location_slug)),
                name: location_slug,
                scene_numbers: references.map(reference => reference.scene_number),
                // scene_lines: references.map(reference => reference.line),
                scene_lines: references.map(reference => reference.startPlaySec),
                // number_of_scenes: references.length,
                number_of_scenes: Array.from(new Set(references
                    .map(scene => scene.scene_number)
                    .filter(number => number)))
                    .length,
                times_of_day,
                interior_exterior
            }
        })
    }
}

const createSceneStatistics = (parsed: parseoutput): sceneStatistics => {
    const sceneStats: singleSceneStatistic[] = []
    parsed.tokens.forEach((tok) => {
        if (tok.type === "scene_heading") {
            sceneStats.push({
                title: tok.text
            });
        }
    });
    return {
        scenes: sceneStats,
    }
}

function locationtype(val: string): 'int' | 'ext' | 'ie' | 'unknown' {
    if (val) {
        if (/i(nt)?\.?\/e(xt)?\.?/i.test(val)) {
            // var idullocl = val.indexOf("/");
            // var idullocl2 = val.lastIndexOf("/");
            // if (idullocl2 > idullocl) { //避开第一个 / ，找到第二个
            //     // (内外景) 且 多地点联合 。 归类为 不确定。
            //     return "unknown";
            // } else {
            //     return "ie";
            // }
            return "ie"
        }
        else if (/i(nt)?\.?/i.test(val)) {
            return "int"
        }
        else if (/e(xt)?\.?/i.test(val)) {
            return "ext"
        }
    }
    return "unknown";
}
function afterdash(val: string): string {
    if (val) {
        let dash = val.indexOf("-"); // 第一个
        if (dash === -1) dash = val.indexOf("–");
        if (dash === -1) dash = val.indexOf("—");
        if (dash === -1) dash = val.indexOf("−");
        if (dash !== -1) {
            var n = val.substring(dash + 1)
            if (n) {
                return n.trim()
            }
        }
    }
    return null;
}
function locationtime(val: string): string {
    if (val) {
        return val.toLowerCase()
            .replace(/\s+/g, ' ')
            .replace(/\.$/g, '')
            // .replace(/[^\w ]+/g, '')
            .replace(/  +/g, ' ')
            .trim()
            .replace(/^(the)?\s*(next|following)\b/i, '')
            .replace(/^(early|late)\b/i, '')
            .trim()
    }
    return "unspecified";
}

const getLengthChart = (parsed: parseoutput): { action: lengthchartitem[], dialogue: lengthchartitem[], durationByProp: any, characters: dialoguechartitem[][], scenes: sceneitem[], characternames: string[], monologues: number } => {
    let action: lengthchartitem[] = [{ line: 0, length: 0, scene: undefined, playTimeSec: 0 }]
    let dialogue: lengthchartitem[] = [{ line: 0, length: 0, scene: undefined, playTimeSec: 0 }]
    let characters = new Map<string, dialoguechartitem[]>();
    let scenes: sceneitem[] = [];
    let previousLengthAction = 0;
    let previousLengthDialogue = 0;
    let currentScene = "";
    let monologues = 0;
    let scenepropDurations = new Map<string, number>();

    let gap = 60;
    // 动态设置人物线图的 下沉 距离。
    if (parsed.tokens && parsed.tokens.length > 1) {
        // if (parsed.tokens[parsed.tokens.length - 1].line && parsed.tokens[parsed.tokens.length - 1].line > 250) {
        //     gap = parsed.tokens[parsed.tokens.length - 1].line / 25
        // }
        if (parsed.properties.lengthAction + parsed.properties.lengthDialogue > 380) {
            gap = (parsed.properties.lengthAction + parsed.properties.lengthDialogue) / 6
        }
    }


    parsed.tokens.forEach(element => {
        if (element.type == "action" || element.type == "dialogue") {
            let time = Number(element.time);
            if (!isNaN(time)) {
                if (element.type == "action") {
                    previousLengthAction += Number(element.time);
                }
                else if (element.type == "dialogue") {
                    previousLengthDialogue += Number(element.time);
                }
            }

            if (element.type == "action") {
                action.push({ line: element.line, length: previousLengthAction, scene: currentScene, playTimeSec: element.playTimeSec });

                // 角色线图，加上action的时间反映。只简单地对包含角色名的action行进行粗略统计。
                if (element.charactersAction && element.charactersAction.length > 0) {
                    element.charactersAction.forEach((character: string) => {
                        if (!isNaN(element.time)) {
                            let time = Number(element.time);
                            let currentCharacter = characters.get(character);
                            let dialogueLength = 0;
                            let wordsLength = 0;
                            let wordcount = getWordCount(element.text);
                            if (!currentCharacter) {
                                characters.set(character, []);
                            }
                            else if (currentCharacter.length > 0) {
                                dialogueLength = currentCharacter[currentCharacter.length - 1].lengthTimeGlobal;
                                wordsLength = currentCharacter[currentCharacter.length - 1].lengthWordsGlobal;
                            }
                            // 判断characters.get(character)的上一个元素的line 和当前 line 相差是否大于10，如果大于10，那么添加不活跃处理，曲线往0走。在他们之间push lengthTimeGlobal 为0的元素。line为中间。
                            let insertPre = false;
                            if (characters.get(character) && characters.get(character).length > 0) {
                                let lastLine = characters.get(character)[characters.get(character).length - 1].line;
                                let lastPlayTimeSec = characters.get(character)[characters.get(character).length - 1].playTimeSec;
                                if (lastPlayTimeSec + gap < element.playTimeSec - element.time) {
                                    characters.get(character).push({
                                        line: lastLine + 1,
                                        playTimeSec: lastPlayTimeSec + 1,
                                        lengthTime: 0,
                                        lengthWords: 0,
                                        lengthTimeGlobal: 0,
                                        lengthWordsGlobal: 0,
                                        monologue: false,
                                        scene: currentScene,
                                    });
                                    insertPre = true;
                                }
                            } else {
                                // 第一个元素
                                insertPre = true;
                            }
                            if (insertPre) {
                                characters.get(character).push({
                                    line: element.line - 2,
                                    playTimeSec: element.playTimeSec - element.time - 1,
                                    lengthTime: 0,
                                    lengthWords: 0,
                                    lengthTimeGlobal: 0,
                                    lengthWordsGlobal: 0,
                                    monologue: false,
                                    scene: currentScene,
                                });
                                characters.get(character).push({
                                    line: element.line - 1,
                                    playTimeSec: element.playTimeSec - element.time,
                                    lengthTime: 0,
                                    lengthWords: 0,
                                    lengthTimeGlobal: dialogueLength,
                                    lengthWordsGlobal: wordsLength,
                                    monologue: false,
                                    scene: currentScene,
                                });
                            }
                            characters.get(character).push({
                                line: element.line,
                                playTimeSec: element.playTimeSec,
                                lengthTime: element.time,
                                lengthWords: wordcount,
                                lengthTimeGlobal: dialogueLength + time,
                                lengthWordsGlobal: wordsLength + wordcount,
                                monologue: false,
                                scene: currentScene,
                            });
                        }
                    })
                }
            }
            else if (element.type == "dialogue") {
                dialogue.push({ line: element.line, length: previousLengthDialogue, scene: currentScene, playTimeSec: element.playTimeSec });
                if (!isNaN(element.time)) {
                    let currentCharacter = characters.get(element.character);
                    let dialogueLength = 0;
                    let wordsLength = 0;
                    let wordcount = getWordCount(element.text); // 写作统计，劳动力，可以用 显示的text
                    let time = Number(element.time);
                    if (!currentCharacter) {
                        characters.set(element.character, []);
                    }
                    else if (currentCharacter.length > 0) {
                        dialogueLength = currentCharacter[currentCharacter.length - 1].lengthTimeGlobal;
                        wordsLength = currentCharacter[currentCharacter.length - 1].lengthWordsGlobal;
                    }
                    let monologue = false;
                    if (isMonologue(time)) {
                        monologue = true;
                        monologues++;
                    }

                    let insertPre = false;
                    // 判断characters.get(character)的上一个元素的line 和当前 line 相差是否大于10，如果大于10，那么添加不活跃处理，曲线往0走。在他们之间push lengthTimeGlobal 为0的元素。line为中间。
                    if (characters.get(element.character) && characters.get(element.character).length > 0) {
                        let lastLine = characters.get(element.character)[characters.get(element.character).length - 1].line;
                        let lastPlayTimeSec = characters.get(element.character)[characters.get(element.character).length - 1].playTimeSec;
                        if (lastPlayTimeSec + gap < element.playTimeSec - element.time) {
                            characters.get(element.character).push({
                                line: lastLine + 1,
                                playTimeSec: lastPlayTimeSec + 1,
                                lengthTime: 0,
                                lengthWords: 0,
                                lengthTimeGlobal: 0,
                                lengthWordsGlobal: 0,
                                monologue: false,
                                scene: currentScene,
                            });
                            insertPre = true;
                        }
                    } else {
                        // 第一个元素
                        insertPre = true;
                    }
                    if (insertPre) {
                        characters.get(element.character).push({
                            line: element.line - 2,
                            playTimeSec: element.playTimeSec - element.time - 1,
                            lengthTime: 0,
                            lengthWords: 0,
                            lengthTimeGlobal: 0,
                            lengthWordsGlobal: 0,
                            monologue: false,
                            scene: currentScene,
                        });
                        characters.get(element.character).push({
                            line: element.line - 1,
                            playTimeSec: element.playTimeSec - element.time,
                            lengthTime: 0,
                            lengthWords: 0,
                            lengthTimeGlobal: dialogueLength,
                            lengthWordsGlobal: wordsLength,
                            monologue: false,
                            scene: currentScene,
                        });
                    }

                    characters.get(element.character).push({
                        line: element.line,
                        playTimeSec: element.playTimeSec,
                        lengthTime: element.time,
                        lengthWords: wordcount,
                        lengthTimeGlobal: dialogueLength + time,
                        lengthWordsGlobal: wordsLength + wordcount,
                        monologue: monologue, //monologue if dialogue is longer than 30 seconds
                        scene: currentScene,
                    });
                }
            }
        }
    });
    parsed.properties.scenes.forEach(scene => {
        currentScene = scene.text;
        // if (scenes.length > 0) {
        //     scenes[scenes.length - 1].endline = scene.line - 1;
        // }
        var deconstructedSlug = regex.scene_heading.exec(scene.text);
        let sceneType: 'int' | 'ext' | 'ie' | 'unknown';
        let sceneTime
        if (deconstructedSlug) {
            sceneType = locationtype(deconstructedSlug?.[1]);
            sceneTime = locationtime(afterdash(deconstructedSlug?.[2]));
        } else {
            // 直接 点“.” 开头的场景
            if (scene.text.trimLeft().startsWith("(内景)") || scene.text.trimLeft().startsWith("（内景）")) {
                sceneType = "int";
            } else if (scene.text.trimLeft().startsWith("(外景)") || scene.text.trimLeft().startsWith("（外景）")) {
                sceneType = "ext";
            } else if (scene.text.trimLeft().startsWith("(内外景)") || scene.text.trimLeft().startsWith("（内外景）")) {
                // var idullocl = scene.text.trimLeft().indexOf("/");
                // if (idullocl > 0) {
                //     // (内外景) 且 多地点联合 。 归类为 不确定。
                //     sceneType = "unknown";
                // } else {
                //     sceneType = "ie";
                // }
                sceneType = "ie";
            } else {
                sceneType = "unknown";
            }
            sceneTime = locationtime(afterdash(scene.text));
        }

        let cs = sceneTime;
        var arr = cs.split(/-|–|—|−/g).filter(function (a) {
            return a;
        }).map(a => {
            return a.trim().toLowerCase()
        });
        if (arr.includes('正午') || arr.includes('上午') || arr.includes('午后') || arr.includes('下午') || arr.includes('日') || arr.includes('白天') || arr.includes('day')) {
            cs = 'day';
        } else if (arr.includes('夜') || arr.includes('深夜') || arr.includes('子夜') || arr.includes('午夜') || arr.includes('夜晚') || arr.includes('晚上') || arr.includes('night')) {
            cs = 'night';
        } else if (arr.includes('傍晚') || arr.includes('黄昏') || arr.includes('dusk') || arr.includes('evening')) {
            cs = 'dusk';
        } else if (arr.includes('拂晓') || arr.includes('黎明') || arr.includes('dawn')) {
            cs = 'dawn';
        } else if (arr.includes('清晨') || arr.includes('早晨') || arr.includes('清早') || arr.includes('早上') || arr.includes('morning')) {
            cs = 'morning';
        } else {
            cs = '';
        }
        // if (sceneTime === '白天') {
        //     sceneTime = 'day';
        // } else if (sceneTime === '夜晚') {
        //     sceneTime = 'night';
        // } else if (sceneTime === '黎明') {
        //     sceneTime = 'dawn';
        // } else if (sceneTime === '黄昏') {
        //     sceneTime = 'dusk';
        // }
        scenes.push({
            type: sceneType,
            line: scene.startPlaySec,
            endline: scene.endPlaySec,
            time: cs,
            scene: scene.text
        });
        let currentLength = scenepropDurations.has('type_' + sceneType) ? scenepropDurations.get('type_' + sceneType) : 0;
        scenepropDurations.set('type_' + sceneType, currentLength + scene.actionLength + scene.dialogueLength);
        currentLength = scenepropDurations.has('time_' + cs) ? scenepropDurations.get('time_' + cs) : 0;
        scenepropDurations.set('time_' + cs, currentLength + scene.actionLength + scene.dialogueLength);
    });
    let characterDuration: dialoguechartitem[][] = [];
    let characterNames: string[] = [];
    characters.forEach((value: dialoguechartitem[], key: string) => {
        characterNames.push(key);
        characterDuration.push(value);
    });

    // const suffLines = parsed.properties.
    // if(action.length>0){
    //     // 末尾复制多一个元素插入数组，只是 line+1

    // }

    return { action: action, dialogue: dialogue, durationByProp: mapToObject(scenepropDurations), scenes: scenes, characters: characterDuration, characternames: characterNames, monologues: monologues };
};

const getWordCount = (script: string): number => {
    return ((script || '').match(/\S+/g) || []).length
}
const getCharacterCount = (script: string): number => {
    return script.length
}
const getCharacterCountWithoutWhitespace = (script: string): number => {
    return ((script || '').match(/\S+?/g) || []).length
}
const getLineCount = (script: string): number => {
    return ((script || '').match(/\n/g) || []).length + 1
}
const getLineCountWithoutWhitespace = (script: string): number => {
    return ((script || '').match(/^.*\S.*$/gm) || []).length
}

const createLengthStatistics = (script: string, pdf: pdfstats, parsed: parseoutput): lengthStatistics => {
    return {
        characters: getCharacterCount(script),
        characterswithoutwhitespace: getCharacterCountWithoutWhitespace(script),
        lines: getLineCount(script),
        lineswithoutwhitespace: getLineCountWithoutWhitespace(script),
        words: getWordCount(script),
        pagesreal: pdf.pagecountReal,
        pages: pdf.pagecount,
        lines_first_scene: parsed.properties.firstSceneLine,
        scenes: Array.from(new Set(parsed.properties.scenes
            .map(scene => scene.number)
            .filter(number => number)))
            .length
    }
}

const createDurationStatistics = (parsed: parseoutput): durationStatistics => {
    let lengthcharts = getLengthChart(parsed);
    return {
        dialogue: parsed.lengthDialogue,
        action: parsed.lengthAction,
        total: parsed.lengthDialogue + parsed.lengthAction,
        durationBySceneProp: lengthcharts.durationByProp,
        lengthchart_action: lengthcharts.action,
        lengthchart_dialogue: lengthcharts.dialogue,
        characters: lengthcharts.characters,
        scenes: lengthcharts.scenes,
        characternames: lengthcharts.characternames,
        monologues: lengthcharts.monologues
    }
}

export const retrieveScreenPlayStatistics = async (script: string, parsed: parseoutput, config: FountainConfig, exportconfig: ExportConfig): Promise<screenPlayStatistics> => {
    const stats = {
        characterStats: createCharacterStatistics(parsed),
        sceneStats: createSceneStatistics(parsed),
        locationStats: createLocationStatistics(parsed),
        durationStats: createDurationStatistics(parsed),
        structure: parsed.properties.structure
    };

    let pdfstats = await GeneratePdf("$STATS$", config, exportconfig, parsed, undefined);
    let pdfmap = mapToObject(pdfstats.linemap);

    return {
        ...stats,
        lengthStats: createLengthStatistics(script, pdfstats, parsed),
        pdfmap: JSON.stringify(pdfmap),
    }
}
