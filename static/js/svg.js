function saveSVG() {
    const svgElement = document.querySelector('svg');
    const serializer = new XMLSerializer();
    let svgString = serializer.serializeToString(svgElement);

    const fontFaces = document.querySelectorAll('style, link[rel="stylesheet"]');
    fontFaces.forEach((face) => {
        svgString = svgString.replace('</svg>', `${face.outerHTML}</svg>`);
    });

    const blob = new Blob([svgString], { type: 'image/svg+xml' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'image.svg';
    link.click();
}

saveSVG();
