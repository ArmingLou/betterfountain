// All these functions here measure some kind of text.
// What kind of text they measure can easily be taken from
// the respective function names.
// Basically all functions use the "measureTextWidth" function
// which uses the "widthOfString" function of pdfKit document.

function measureTextWidth(text, font, fontSize, characterSpacing, doc) {
  let res = doc.font(font).fontSize(fontSize).widthOfString(text, { lineBreak: false, characterSpacing: characterSpacing });
  if(text){
    res = res + characterSpacing;
  } 
  return res
}
function measureTextHeight(text, font, fontSize, doc) {
  return doc.font(font).fontSize(fontSize).heightOfString(text, { lineBreak: false });
}

function measureTextsWidth(texts, doc) {
  const textsWithWidth = texts.map((textPart) => {
    const { fontSize, font, text, characterSpacing } = textPart;
    textPart.width = measureTextWidth(text, font, fontSize, characterSpacing, doc);
    return textPart;
  });
  return textsWithWidth;
}

function checkParagraphFitsInLine(paragraph, textWidth) {
  let paragraphWidth = 0;
  paragraph.forEach((textpart) => (paragraphWidth += textpart.width));
  return paragraphWidth <= textWidth;
}

function measureTextFragments(textArray, spaceWidth, font, fontSize, characterSpacing, doc) {
  return textArray.map((textFragment) => {
    if (textFragment === " ")
      return {
        text: textFragment,
        width: spaceWidth,
      };
    return {
      text: textFragment,
      width: measureTextWidth(textFragment, font, fontSize, characterSpacing, doc),
    };
  });
}

exports.measureTextsWidth = measureTextsWidth;
exports.measureTextWidth = measureTextWidth;
exports.measureTextHeight = measureTextHeight;
exports.checkParagraphFitsInLine = checkParagraphFitsInLine;
exports.measureTextFragments = measureTextFragments;
