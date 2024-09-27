// All these functions here measure some kind of text.
// What kind of text they measure can easily be taken from
// the respective function names.
// Basically all functions use the "measureTextWidth" function
// which uses the "widthOfString" function of pdfKit document.

function measureTextWidth(text, font, fontSize, doc) {
  return doc.font(font).fontSize(fontSize).widthOfString(text, { lineBreak: false });
}
function measureTextHeight(text, font, fontSize, doc) {
  return doc.font(font).fontSize(fontSize).heightOfString(text, { lineBreak: false });
}

function measureTextsWidth(texts, doc) {
  const textsWithWidth = texts.map((textPart) => {
    const { fontSize, font, text } = textPart;
    textPart.width = measureTextWidth(text, font, fontSize, doc);
    return textPart;
  });
  return textsWithWidth;
}

function checkParagraphFitsInLine(paragraph, textWidth) {
  let paragraphWidth = 0;
  paragraph.forEach((textpart) => (paragraphWidth += textpart.width));
  return paragraphWidth <= textWidth;
}

function measureTextFragments(textArray, spaceWidth, font, fontSize, doc) {
  return textArray.map((textFragment) => {
    if (textFragment === " ")
      return {
        text: textFragment,
        width: spaceWidth,
      };
    return {
      text: textFragment,
      width: measureTextWidth(textFragment, font, fontSize, doc),
    };
  });
}

exports.measureTextsWidth = measureTextsWidth;
exports.measureTextWidth = measureTextWidth;
exports.measureTextHeight = measureTextHeight;
exports.checkParagraphFitsInLine = checkParagraphFitsInLine;
exports.measureTextFragments = measureTextFragments;
