// Fork

import {json} from './Json.js'


// ///////////////////////////////////////////////////////////////////////////////////////// //
// ///////////////////////////////////////////////////////////////////////////////////////// //
// ///////////////////////////////////////////////////////////////////////////////////////// //
// Données Lidarz.py
let webConfig = {}, layout = {}, lidars = [], lidarRead, allData = [];
// Régions de points LIDAR
let tRegions;
// --------------------------------------------------------------------------------------------
const wSpace = 3650, dSpace = 2500;             // Largeur et profondeur de l'espace
const wST = 1920, hST = 1200;                   // Dimensions écran
const r2D = 1.0 / Math.PI * 180.0;              // Conversion radians en degrés
// --------------------------------------------------------------------------------------------
// Zones
const nbZones = 8, marginSides = (wST / (nbZones * 2)) / 1.5;
const wZone = (wST - marginSides * 2) / nbZones;
const numberOfDetectionsRequired = 20;
let tZones = []
const colors = [0xFF0000, 0xFF8800, 0xFFFF00, 0x88FF00, 0x00FF00, 0x00FF88, 0x00FFFF, 0x0088FF, 0x0000FF, 0x8800FF, 0xFF00FF, 0xFF0088]
// --------------------------------------------------------------------------------------------
// Références les éléments PIXI
let app, ctrPts, ctrRegions;

// --------------------------------------------------------------------------------------------
// --------------------------------------------------------------------------------------------
// --------------------------------------------------------------------------------------------
let ctrZones, prevZone = undefined;
// Position des éléments parallaxes
let xPM = 0, xPV = 0, xPC3 = 0, xPP = 0, xPC2 = 0, xPST = 0, xPSB = 0, xPR1 = 0, xPR2 = 0
// Référence les images présentes dans le HTML qui seront animées ou utilisées en décor de scène
const mountains = $('#mountains')
const village = $('#village')
const cotes3 = $('#cotes-3')
// const port = $('#port')
// const cotes2 = $('#cotes-2')
const smokeT = $('#smoke-top')
const smokeB = $('#smoke-bottom')
const rocher1 = $('#rocher-1')
const rocher2 = $('#rocher-2')

// Display debug graphiques pour les données LIDARs
const debugLIDAR = true;
let allowDrawing = false;   // A supprimer en prod






// ///////////////////////////////////////////////////////////////////////////////////////// //
// ///////////////////////////////////////////////////////////////////////////////////////// //
// ///////////////////////////////////////////////////////////////////////////////////////// //
class Point {
    constructor(x, y, scale = 1.0, offsetX = 0.0, offsetY = 0.0) {
        this.x = offsetX + x * scale;
        this.y = offsetY + y * scale;
        this.distance = Math.sqrt(x * x + y * y) * scale;
        this.radians = Math.atan2(y, x);
        this.angle = this.radians * r2D;
    }
    distanceTo(point) {
        let calculations = Math.sqrt(Math.pow(point.x - this.x, 2) + Math.pow(point.y - this.y, 2))
        this.distPrev = calculations
        return calculations;
    }
}

// ///////////////////////////////////////////////////////////////////////////////////////// //
class Region{
    constructor(pts, clr = 0xFFFFFF){
        this.points = pts;
        this.length = this.points.length;
        this.color = clr;
    }

    addPt(pt){
        this.points.push(pt);
        this.length = this.points.length;
    }

    // --------------------------------------------------------------------------------------------
    // Utilitaires
    /*
    area() {
        let area = 0, i, j, point1, point2;
        for (i = 0, j = this.length - 1; i < this.length; j = i, i++) {
            point1 = this.points[i];
            point2 = this.points[j];
            area += point1.x * point2.y;
            area -= point1.y * point2.x;
        }
        area /= 2;

        return area;
    }
    
    centroid() {
        let x = 0, y = 0, i, j, f, point1, point2;
        for (i = 0, j = this.length - 1; i < this.length; j=i,i++) {
            point1 = this.points[i];
            point2 = this.points[j];
            f = point1.x * point2.y - point2.x * point1.y;
            x += (point1.x + point2.x) * f;
            y += (point1.y + point2.y) * f;
        }
        f = this.area() * 6;

        return new Point(x / f, y / f);
    };
    */

    center(){
        const arr = this.points;
        const x = arr.map(xy => xy.x);
        const y = arr.map(xy => xy.y);
        const minX = Math.min(...x);
        const maxX = Math.max(...x);
        const minY = Math.min(...y);
        const maxY = Math.max(...y);
        const cx = (minX + maxX) * 0.5;
        const cy = (minY + maxY) * 0.5;
        const rMin = Math.sqrt(Math.pow(minX - cx, 2) + Math.pow(minY - cy, 2))
        const rMax = Math.sqrt(Math.pow(maxX - cx, 2) + Math.pow(maxY - cy, 2))
        return {x:cx, y:cy, radius: Math.max(rMin, rMax)};
    }

    // --------------------------------------------------------------------------------------------
    // Dessins
    drawRegion(){
        const ctr = this.center()
        ctrRegions.circle(ctr.x, ctr.y, ctr.radius)
        ctrRegions.fill(0xFFFFFF, 0.04)   
    }
    drawPts(size = 1){
        for (const pt of this.points) {
            ctrPts.rect(pt.x - size * 0.5, pt.y - size * 0.5, size, size)   
            ctrPts.fill(this.color)
        }
    }
    drawLines(){
        const first = this.points[0]
        ctrPts.moveTo(first.x, first.y)

        for (const pt of this.points) {
            ctrPts.lineTo(pt.x, pt.y)   
            ctrPts.stroke({width:1.0, color:this.color, alpha:0.2})
        }
    }
}

// ///////////////////////////////////////////////////////////////////////////////////////// //
class Zone {
    active = false;
    nb = 0;
    nbDetect = 0;

    constructor(idx, o){
        // ----------------------------------------------------------
        // Ajoute la zone au tableau pour le manipuler ultérieurement
        tZones.push(this)
        // ----------------------------------------------------------
        // Stocke l'indice
        this.idx = idx;
        // ----------------------------------------------------------
        // Stocke les données associées à la zone
        this.o = o;

        // Pour connaître la progression de l'animation
        this._compTitle = false;
        this._compArrows = false;
        this._compImg = false;
        this._compLgdW = false;
        this._compLgdH = false;
    }

    activate(){
        this.active = true;

        // Objet, durée, délai
        const o = this.o;
        const dur = 0.95;
        let delai = this._compTitle === false ? 0.8 : 0

        // Indique qu'aucune séquence d'animation n'est complète
        this._compTitle = this._compArrows = this._compImg = this._compLgdW = this._compLgdH = false;
        // Supprime les tweens
        this.killTweens()
    
        // Début cycle animation
        gsap.to(o.ctrTitle, 0.6, {delay:delai, width:o.wT, opacity:1, ease:"back.out(3.5)", onComplete:() => {
            this._compTitle = true;
        }})
        delai += 0.6
        gsap.to(o.aR, 0.4, {delay:delai, x:0, ease:"back.out(3.5)"})
        gsap.to(o.aL, 0.4, {delay:delai, x:0, ease:"back.out(3.5)", onStart:() => {
            o.aR.show()
            o.aL.show()
        }, onComplete:() => {
            this._compArrows = true;
        }})
        delai += 0.2

        gsap.set(o.img, {"z-index":200})
        gsap.to(o.img, dur, {delay:0, x:o.imgOffX -o.xWait, y:o.imgOffY -o.yWait, width:o.imgW, opacity:1.0, ease:"back.out(1.7)", onComplete:() => {
            this._compImg = true;
        }})
        delai += 0.15

        gsap.to(o.ctrLgd, 0.3, {opacity:1.0, delay:delai})
        gsap.to(o.ctrLgd, 0.4, {width:o.wL + 33, ease:"back.out(2)", delay:delai + 0.35, onComplete:() => {
            this._compLgdW = true;
        }})
        gsap.to(o.ctrLgd, 1.2, {height:o.hTxt, ease:"back.out(2)", delay:delai + 0.35 + 0.4, onComplete:() => {
            this._compLgdH = true;
        }})

    }
    deactivate(){
        this.active = false;

        // Objet
        const o = this.o;
        // Supprime les tweens
        this.killTweens()

        // Début cycle animation
        gsap.to(o.ctrLgd, 0.4, {height:0, ease:"back.in(2)"})
        gsap.to(o.ctrLgd, 0.3, {width:0, ease:"back.in(2)", delay:0.4})
        gsap.to(o.ctrLgd, 0.5, {opacity:0.0, delay:0.75})

        gsap.to(o.img, 0.5, {delay:this._compImg ? 0.3 : 0.0, x:0, y:0, width:o.wWait, opacity:0.8, ease:"back.in(3.5)", onComplete:() => {
            gsap.set(o.img, {"z-index":0})
        }})

        gsap.to(o.aR, 0.25, {delay:this._compArrows ? 0.4 : 0.0, x:-32, ease:"back.in(3.5)", onComplete:() => {
            o.aR.hide()
            o.aL.hide()
        }})
        gsap.to(o.aL, 0.25, {delay:this._compArrows ? 0.4 : 0.0, x:32, ease:"back.in(3.5)"})
        gsap.to(o.ctrTitle, 0.5, {delay:this._compTitle ? 0.6 : 0.0, width:0, ease:"back.in(2)", onComplete:() => {
            this._compTitle = false;
        }})
        gsap.to(o.ctrTitle, 0.35, {delay:this._compTitle ? 0.6 + 0.4: 0.4, opacity:0})
    }

    killTweens(){
        const o = this.o;

        gsap.killTweensOf(this)
        gsap.killTweensOf(o.ctrLgd)
        gsap.killTweensOf(o.img)
        gsap.killTweensOf(o.ctrTitle)
        gsap.killTweensOf(o.aR)
        gsap.killTweensOf(o.aL)
    }
}


// ///////////////////////////////////////////////////////////////////////////////////////// //
// Pour afficher les données de config en passant des position/dimensions. Evite d'écrire à la main
class Config {
    constructor(name, serialPort, x, y, w, h){
        console.log(`
            [${name}]
            serial-port = ${serialPort}
            serial-baudrate = 230400
            filter = [(${-x * 0.001}, ${-y * 0.001}), (${-x * 0.001}, ${(h-y) * 0.001}), (${(w-x) * 0.001}, ${(h-y) * 0.001}), (${(w-x) * 0.001}, ${-y * 0.001})]
            offset = [0.0, 0.0]
            rotate = 0.0
            confidence = 220
            `)
    }
}
// new Config('LIDAR1', 'COM3', 200, 0, 3650, 2500)
// new Config('LIDAR2', 'COM2', 1825, 0, 3650, 2500)
// new Config('LIDAR3', 'COM1', 3450, 0, 3650, 2500)



// ///////////////////////////////////////////////////////////////////////////////////////// //
// ///////////////////////////////////////////////////////////////////////////////////////// //
// ///////////////////////////////////////////////////////////////////////////////////////// //
async function init() {
    try {
        const response = await fetch(`http://${location.host}/config`);
        if (!response.ok) {
            throw new Error(`Response status: ${response.status}`);
        }
        webConfig = await response.json();

        const ranges = Object.keys(webConfig)
            .filter(key => key.startsWith("LIDAR"))
            .map(key => webConfig[key])
            .flat();
        const xs = ranges.map(p => p[0]);
        const ys = ranges.map(p => p[1]);
        // console.log(ranges, xs, ys)

        let xmin = Math.min(...xs);
        let xmax = Math.max(...xs);
        let ymin = Math.min(...ys);
        let ymax = Math.max(...ys);

        // const xMargin = (xmax - xmin) * 0.01;
        // const yMargin = (ymax - ymin) * 0.01;

        // xmin -= xMargin;
        // xmax += xMargin;
        // ymin -= yMargin;
        // ymax += yMargin;

        const bboxWidth = xmax - xmin;
        const bboxHeight = ymax - ymin;
        const aspectRatio = bboxWidth / bboxHeight;
        let finalWidth, finalHeight;

        if (aspectRatio > wST / hST) {
            finalWidth = wST;
            finalHeight = wST / aspectRatio;
        } else {
            finalHeight = hST;
            finalWidth = hST * aspectRatio;
        }

        // Position des LIDAR par rapport à la pièce
        const dataLidars = Object.keys(webConfig)
            .filter(key => key.startsWith("LIDAR"))
            .map(key => {
                const lidar = webConfig[key]
                const xs = lidar.map(p => p[0]), ys = lidar.map(p => p[1]);
                const xmin = Math.min(...xs), xmax = Math.max(...xs);
                const ymin = Math.min(...ys), ymax = Math.max(...ys);
                return {n:key, x:(-xmin / (xmax - xmin)) * finalWidth, y:(-ymin / (ymax - ymin)) * finalHeight}
            })
        
        // Infos globales
        layout = {
            title: 'OKDO LD06 to WebSocket',
            xaxis: { title: 'X', fixedrange: true, range: [xmin, xmax], visible: false, w:bboxWidth},
            yaxis: { title: 'Y', fixedrange: true, range: [ymin, ymax], visible: false, h:bboxHeight},
            lidars:dataLidars,
            autosize: false,
            width: finalWidth,
            height: finalHeight,
            aspectRatio:aspectRatio,
            ratioSpaceScreen:wST / bboxWidth,
            margin: {l: 0, r: 0, b: 0, t: 0, pad: 0}
        };

        // --------------------------------------------------------------------------------------------
        // Initialise les éléments HTML
        await initHTML();
        // Initialise PIXI pour debugger les points
        if(debugLIDAR) await initPIXI();

        // --------------------------------------------------------------------------------------------
        // Initialise les LIDARs et démarre le socket
        initLidarz();

        // --------------------------------------------------------------------------------------------
        console.log("///////////////////////////////////////////")
        console.log('Config path:', `http://${location.host}/config`)
        console.log("WebConfig:", webConfig)
        console.log("Layout:", layout)
        console.log("tZones:", tZones)
        console.log("LIDARs:", lidars)
    } 
    catch (error) {
        console.error(error.message);
    }
}
// ///////////////////////////////////////////////////////////////////////////////////////// //
function initLidarz() {
    lidars = Object.keys(webConfig).filter(item => item !== "DEBUG");
    // Copie du tableau qui contient les LIDARs à traiter/analyser
    lidarRead = [...lidars];

    // Démarre la connection avec le socket
    startConnection();
}
// ///////////////////////////////////////////////////////////////////////////////////////// //
async function startConnection() {
    // Socket pour le communication avec python
    let socket = new WebSocket(`ws://${location.host}/ws`);

    // --------------------------------------------------------------------------------------------
    /** Permet de recevoir tous les messages de chaque LIDAR connecté */
    socket.onmessage = function(evt) {
        const newData = JSON.parse(evt.data);
        const lidarName = Object.keys(newData)[0];
        const lidarData = Object.values(newData)[0];

        if (lidarRead.includes(lidarName)) {
            // Nombre de lidars restant à lire/recevoir ses données
            lidarRead = lidarRead.filter(item => item !== lidarName);

            // Génère un objet spécifique pour le LIDAR en cours de réception
            allData.push({ 
                name: lidarName,
                pts: lidarData.map(point => new Point(-point[0], point[1], layout.ratioSpaceScreen, wST * 0.5)),
            });

            // Quand toutes les données des différents LIDARs ont été reçues, dessine/analyse les points
            if(lidarRead.length === 0) {
                // if(allowDrawing) {
                    for (const lidar of allData) {
                        analyzeDataLIDARs(lidar)
                    }
                    // allowDrawing = false
                // }

                // Vide les données
                allData = [];
                // Remet l'ensemble des données à recevoir avant de les analyser
                lidarRead = [...lidars];
            }
        } else {
            console.log(`${lidarName} message rejected`);
        }
    };

    // --------------------------------------------------------------------------------------------
    socket.onopen = function() {
        console.log("WebSocket connecté");
    };
    // --------------------------------------------------------------------------------------------
    socket.onclose = function() {
        console.log("WebSocket déconnecté");
    };
}
// ///////////////////////////////////////////////////////////////////////////////////////// //
// Initialise l'appli
window.onload = () => { 
    // // --------------------------------------------------------------------------------------------
    // // Création des points par défaut. Ils sont réuitilisés par la suite
    // for(let i = 0 ; i < nbMaxPts ; i++) tPts.push(new Point(0, 0))

    init() 

    $(document).on('click', () => {
        allowDrawing = true;
    })
};



// ///////////////////////////////////////////////////////////////////////////////////////// //
// ///////////////////////////////////////////////////////////////////////////////////////// //
// ///////////////////////////////////////////////////////////////////////////////////////// //
async function initHTML() {
    // --------------------------------------------------------------------------------------------
    // Création des zones
    createElements();
    createZones();

    // --------------------------------------------------------------------------------------------
    // Déplacement des éléments de décor
    moveBgs()

    // --------------------------------------------------------------------------------------------
    // Ajout écouteur d'événements
    // window.addEventListener("mousemove", onMove)   
}
async function initPIXI(){
    app = new PIXI.Application()
    await app.init({
        background:0x000000, 
        backgroundAlpha: 0.85, 
        width:wST, 
        height:hST, 
        antialias:true
    })
    document.body.appendChild(app.canvas);
    $(app.canvas).appendTo('#app')

    // Mise à l'échelle
    $('#app').css({
        width:wST,
        height:hST,
        position:'absolute', 
        top:0, 
        left:0
    })

    // --------------------------------------------------------------------------------------------
    // Création des repères
    drawLimits()

    // --------------------------------------------------------------------------------------------
    // Debug LIDAR
    ctrPts = new PIXI.Graphics()
    app.stage.addChild(ctrPts)
    ctrRegions = new PIXI.Graphics()
    app.stage.addChild(ctrRegions)

    // --------------------------------------------------------------------------------------------
    // A supprimer...
    // Sélecteur couleurs
    $('.colorPick').on('click', (e) => {
        console.log($(e.currentTarget).data("clr"))
        if($(e.currentTarget).data("clr") === "#fff"){
            $('#app').toggle()
        }
        else {
            $('body').css('background-color', $(e.currentTarget).data("clr"))
        }
    })
}
// ///////////////////////////////////////////////////////////////////////////////////////// //
function drawLimits(useSep = true){
    const r = new PIXI.Graphics();
    app.stage.addChild(r)

    // Simule les zones
    if(useSep){
        for(let i = 0 ; i <= nbZones ; i++){
            r.moveTo(marginSides + i * wZone, 0).lineTo(marginSides + i * wZone, hST)

            if(i < nbZones){
                // Texte bpour afficher le nombre de points par zone
                let tDb = $('<p>').css({
                    position:'absolute', 
                    width:wZone - 60, 
                    left:marginSides + i * wZone + 30,
                    bottom:20,
                    'font-size':11,
                    color:'white',
                    // 'background-color':'gray',
                    'text-align': 'center',
                })
                .text("nb elts:0").appendTo($('body'))
                tZones[i].tDb = tDb;     
                
                // Recatngle pour symboliser la zone dans laquelle un ou des utilisateurs sont présents
                const rZ = new PIXI.Graphics();
                app.stage.addChild(rZ)
                rZ.rect(marginSides + i * wZone, 0, wZone, hST)
                rZ.fill(0xffffff, 0.2);
                rZ.visible = false;
                tZones[i].rZ = rZ;  
            }
        }
    }
    r.stroke({color: 0xffffff, width: 1, alpha:0.2 });

    // Simule l'écran
    r.rect(0, 0, wST, hST)
    r.stroke({ color: 0xffffff, width: 1, alpha:0.8 });

    // --------------------------------------------------------------------------------------------
    // Marge horizontale
    const xMarginSpace = (wST - layout.width) * 0.5;

    // Simule la pièce
    r.rect(xMarginSpace, (hST - layout.height) * 0.5, layout.width, layout.height)
    r.stroke({ color: 0xffff00, width: 2 })

    // Simule la position des LIDAR
    for (const l of layout.lidars) {
        r.circle(xMarginSpace + l.x, l.y, 4)
        r.stroke({ color: 0xffff00, width: 2})

        const t = new PIXI.Text({text:l.n, style:{fontFamily:'Arial', fontSize:8, fill:0xFFFF00}})
        t.x = xMarginSpace + l.x - t.width * 0.5;
        t.y = 7
        app.stage.addChild(t)
    }
}



// ///////////////////////////////////////////////////////////////////////////////////////// //
// ///////////////////////////////////////////////////////////////////////////////////////// //
// ///////////////////////////////////////////////////////////////////////////////////////// //

// --------------------------------------------------------------------------------------------
// --------------------------------------------------------------------------------------------
// Création des zones
function createZones(){
    // Boucle pour créer des graphiques pour chaque zone
    for(let i = 0 ; i < nbZones ; i++) 
        new Zone(i, json[i]);
}

// --------------------------------------------------------------------------------------------
// --------------------------------------------------------------------------------------------
// Création des blocs texte légendes en HTML pour un meilleur rendu/lisibilité
function createElements(){
    for(let i = 0 ; i < json.length ; i++) {
        const o = json[i]
        createLegend(o, i)
        createVisuel(o, i)
        createTitle(o, i)
    }
}
function createTitle(o, i){
    const divA = $('<div>')
        .addClass('ctr-title-anim')
        .css({top:o.yT + o.tOY + 50, left:o.xT + o.tOX, width:o.wT})
        .appendTo('#wrapper-txts')
    
    // Flèches Sides
    const aL = $('<img />')
        .attr("src", "./assets/SVG/arrow_cartel.svg")
        .addClass("arrow" + ((i > 5 || i == 1) ? " two" : "") )
        .appendTo(divA)
    const aR = $('<img />')
        .attr("src", "./assets/SVG/arrow_cartel.svg")
        .addClass("arrow right" + ((i > 5 || i == 1) ? " two" : ""))
        .appendTo(divA)

    // Conteneur Titre
    const div = $('<div>')
        .addClass('ctr-title' + ((i > 5 || i == 1) ? " two" : "") )
        .css({width:o.wT})
        .appendTo(divA)

    // Titre
    $('<p>')
        .addClass('title castellar')
        .attr({id:`title-${i}`})
        .css({'text-align': 'center', width:o.wT})
        .html(o.title)
        .appendTo(div)

    // Référence le conteneuret les flèches pour animations
    o.ctrTitle = divA, o.aL = aL, o.aR = aR;
    o.tx = o.xT + o.tOX

    // Initialisation
    gsap.set(o.aR, {x:-32})
    gsap.set(o.aL, {x:32})
    gsap.set(o.ctrTitle, {width:0, opacity:0})
    o.aR.hide()
    o.aL.hide()
}
function createLegend(o, i){
    const divA = $('<div>')
        .addClass('ctr-legend-anim')
        .css({top:o.yT + 50, left:o.xT, width:o.wL + 33})
        // .css({top:o.yT + 50, left:o.xT, width:0, height:0, opacity:0})
        .appendTo('#wrapper-txts')
    
    // Référence le conteneur pour l'animer
    o.ctrLgd = divA;

    const div = $('<div>')
        .addClass('ctr-legend')
        .css({width:o.wL})
        .appendTo(divA)

    const lgd = $('<p>')
        .addClass('legend')
        .attr({id:`legend-${i}`})
        .css({'text-align': 'center', width:o.wL - 78})
        .text(o.legend)
        .appendTo(div)

    o.h = divA.height()
    // console.log(i, o.h, lgd.height() + 22, lgd.height())

    // Initalisation
    gsap.set(o.ctrLgd, {width:0, height:0, opacity:0})
}
function createVisuel(o, i){
    // Image
    const img = $(`#${o.id}`)   
    // const imgO = $(`#o-${o.id}`)   
    // Position de l'image
    // const cssImg = {top:o.yT - img.height() + o.imgOffY, left:o.xT + o.imgOffX}
    // console.log("left:", o.xT, "/", o.xT + o.imgOffX, "/", o.xWait, "| top:", o.yT, "/", img.height(), "/", o.yWait, o.yWait - o.yT)
    const cssImg = {top:o.yT - img.height() + o.yWait, left:o.xT + o.imgOffX + o.xWait}
    // if(o.imgW) cssImg['width'] = o.imgW
    cssImg['width'] = o.wWait
    img.css(cssImg)
    // Ajoute l'image au conteneur
    img.appendTo('#wrapper-txts')
    // Référence l'image
    o.img = img;
    o.imgX = o.xT + o.imgOffX;
    // o.imgY = o.yT - img.height() + o.imgOffY;
    o.imgY = o.yT - img.height() + o.yWait;
}




// ///////////////////////////////////////////////////////////////////////////////////////// //
// ///////////////////////////////////////////////////////////////////////////////////////// //
// ///////////////////////////////////////////////////////////////////////////////////////// //
// Ecouteurs d'événements
function onMove(e){
    // Ratio pour la souris
    xM = e.clientX / wST;

    const idxZone = Math.floor((e.clientX - marginSides) / wZone)
    // console.log(idxZone)

    if((idxZone === -1 || idxZone === nbZones) && prevZone != undefined){
        prevZone.deactivate()
        prevZone = undefined
    }
    else {
        const zoneOver = tZones[idxZone]

        // Si la zone survolée est différente de la zone précédemment stockée
        if(prevZone != zoneOver){
            // Désactive la zone précédente
            if(prevZone)  prevZone.deactivate()

            // Active la zone survolée
            zoneOver.activate()
            prevZone = zoneOver
        }              
    }
}



// ///////////////////////////////////////////////////////////////////////////////////////// //
// ///////////////////////////////////////////////////////////////////////////////////////// //
// ///////////////////////////////////////////////////////////////////////////////////////// //
function moveBgs(){
    requestAnimationFrame(moveBgs)

    gsap.set(mountains, {x:xPM})
    // Positif
    xPM += 600 / (240 * 60)
    if (xPM > 1920) xPM = 0
    // Négatif
    // xPM -= 600 / (240 * 60)
    // if (xPM < -1920) xPM = 0

    // gsap.to(mountains, 240, {x:600, ease:"none"})
    gsap.set(village, {x:xPV})
    // Positif
    xPV += 1200 / (240 * 60)
    if (xPV > 1920) xPV = -810
    // Négatif
    // xPV -= 1200 / (240 * 60)
    // if (xPV < -810) xPV = 1920

    gsap.set(cotes3, {x:xPC3})
    xPC3 -= 2200 / (240 * 60)
    // if (xPC3 > 1500) xPC3 = -2200
    if (xPC3 < -2200) xPC3 = 1500

    // gsap.set(port, {x:xPP})
    // xPP += 2600 / (240 * 60)
    // gsap.set(cotes2, {x:xPC2})
    // xPC2 += 2700 / (240 * 60)
    // if (xPC2 > 1920 + 1800) {
    //     xPC2 = -200
    //     xPP = -200
    // }

    gsap.set(smokeT, {x:xPST})
    xPST += 1920 / (240 * 60)
    if (xPST > 1920) xPST = 0

    gsap.set(smokeB, {x:xPSB})
    xPSB -= 1920 / (240 * 60)
    if (xPSB < -1920) xPSB = 0

    gsap.set(rocher1, {x:xPR1})
    xPR1 -= (1920 * 3) / (240 * 60)
    // if (xPR1 > 1920) xPR1 = -600
    if (xPR1 < -600) xPR1 = 1920

    gsap.set(rocher2, {x:xPR2})
    xPR2 -= (1920 * 4) / (240 * 60)
    // if (xPR2 > 1920) xPR2 = -1800
    if (xPR2 < -1800) xPR2 = 1920
}






// ///////////////////////////////////////////////////////////////////////////////////////// //
// ///////////////////////////////////////////////////////////////////////////////////////// //
// ///////////////////////////////////////////////////////////////////////////////////////// //
function analyzeDataLIDARs(lidar){
    // const sT = performance.now()

    // --------------------------------------------------------------------------------------------
    // Repasse toutes les valeurs à 0
    for (const z of tZones) z.nb = 0;
    // console.log("Clean", performance.now() - sT)

    // --------------------------------------------------------------------------------------------
    // Ordonne les points par région
    // Reset le tableau des régions
    tRegions = []
    // Copie des points
    let pts = [...lidar.pts]
    // Boucle tant qu'il reste des points
    while(pts.length > 0) {
        // Cible le premier point
        const first = pts.splice(pts.length - 1, 1)[0]
        // Crée une nouvelle région et ajoute le premier point
        const lastRegion = new Region([first], colors[tRegions.length % colors.length])
        // Ajoute la nouvelle région au tableau tRegions
        tRegions.push(lastRegion)
        // Point précédent
        let prev = first;

        // Boucle inverse sur les points restants
        for (let i = pts.length - 1; i >= 0; i--) {
            const pt = pts[i]
            const d = pt.distanceTo(first)
            const dP = pt.distanceTo(prev)
            // Si la distance est inférieure à une valeur, supprime le point du tableau et l'ajoute à la région
            if(d < 50 || dP < 20){
                lastRegion.addPt(pt);
                prev = pt;
                pts.splice(i, 1);
            }
        }        
    }
    // console.log("Order Points/Regions", performance.now() - sT)

    // --------------------------------------------------------------------------------------------
    // Calcul le nombre de points par zone
    for (const pt of lidar.pts) {
        const idxZone = Math.max(0, Math.min(nbZones - 1, Math.floor(((pt.x - marginSides) / (wST - marginSides * 2)) * nbZones)));
        // if(idxZone >= 0 && idxZone < nbZones && pt.y < 100.0)
            tZones[idxZone].nb += 1;          
    }
    // console.log("Nb Pts", performance.now() - sT)

    // --------------------------------------------------------------------------------------------
    // Affiche le nombre de points par zone
    for (const z of tZones) {
        if(debugLIDAR) z.tDb.text(`nb elts:${z.nb}`)
        
        // Affiche la zone si il y a au moins 20 points à l'intérieur
        // z.rZ.visible = (z.nb > 20)

        // Augmente/Diminue le nombre de détections
        if(z.nb > 20) z.nbDetect = Math.min(numberOfDetectionsRequired, z.nbDetect + 1)
        else z.nbDetect = Math.max(0, z.nbDetect - 1)

        // Active ou désactive une zone
        if(z.active === false && z.nbDetect === numberOfDetectionsRequired){
            z.active = true;
            z.activate();
            if(debugLIDAR) z.rZ.visible = true;
        }
        else if(z.active === true && z.nbDetect === 0){
            z.active = false;
            z.deactivate();
            if(debugLIDAR) z.rZ.visible = false;
        }
    }
    // console.log("Display Nb Pts", performance.now() - sT)

    // --------------------------------------------------------------------------------------------
    if(debugLIDAR){
        // Efface les contenus précédents
        ctrPts.clear();
        ctrRegions.clear()  

        // Dessine les régions
        for (const r of tRegions) {
            if(r.length > 4){
                r.drawRegion()
                r.drawPts()
                r.drawLines()
            }
        }    
    }
    // console.log("Draw Pts", performance.now() - sT)

    // --------------------------------------------------------------------------------------------
    // Log
    // if(idx === 0) {
        // console.log(lidar)
        // console.log(tZones)
        // console.log(tPts)
        // console.log(tRegions)

        // idx = 1;
    // }
}