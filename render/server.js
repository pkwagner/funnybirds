var express = require('express');
var app = express();
app.engine('html', require('ejs').renderFile);
app.set('views', __dirname);
//console.log(__dirname + '/views')
app.set('view engine', 'html');
app.use(express.static(__dirname + '/js/three.js-master/examples'));

var fs = require("fs");
const puppeteer = require('puppeteer')
const RENDER_TIMEOUT_MS = 30_000
const RENDER_SIZE = 256
const RENDER_PAGE_MAX_RENDERS = 1_000

let browserPromise
let renderPage
let renderPagePromise
let renderPageRenderCount = 0
let renderQueue = Promise.resolve()

function getBrowser() {
    if (!browserPromise) {
        browserPromise = puppeteer.launch( {
            headless: ! process.env.VISIBLE,
            args: [
                '--use-gl=swiftshader',
                '--no-sandbox',
                '--enable-surface-synchronization'
            ]
        } )
    }
    return browserPromise
}

async function getRenderPage() {
    if (!renderPagePromise) {
        renderPagePromise = (async () => {
            const browser = await getBrowser()
            const page = await browser.newPage()
            await page.setViewport({ width: RENDER_SIZE, height: RENDER_SIZE })
            await page.goto('http://localhost:8081/render_worker', { waitUntil: 'domcontentloaded' })
            await page.waitForFunction('typeof window.renderFunnyBird === "function"')
            renderPage = page
            return page
        })()
    }
    return renderPagePromise
}

async function closeRenderPage(reason) {
    const page = renderPage
    renderPage = undefined
    renderPagePromise = undefined
    renderPageRenderCount = 0

    if (!page || page.isClosed()) return

    console.log(reason)
    try {
        await page.close()
    } catch (err) {
        console.error('Failed to close render page:', err)
    }
}

async function recycleRenderPageIfNeeded() {
    if (!RENDER_PAGE_MAX_RENDERS || renderPageRenderCount < RENDER_PAGE_MAX_RENDERS) return
    await closeRenderPage('Recycling render page after ' + renderPageRenderCount + ' renders')
}

function withTimeout(promise, ms) {
    let timeout
    return Promise.race([
        promise,
        new Promise((resolve, reject) => {
            timeout = setTimeout(() => reject(new Error('Render timed out')), ms)
        })
    ]).finally(() => clearTimeout(timeout))
}

async function renderRequest(req, res) {

    var params = '?' + req.url.split('?')[1];
    const renderStart = Date.now()
    try {
        await recycleRenderPageIfNeeded()
        const page = await getRenderPage()
        await withTimeout(page.evaluate((params) => window.renderFunnyBird(params), req.query), RENDER_TIMEOUT_MS)
        console.log('Rendered request in ' + (Date.now() - renderStart) + 'ms')
        const x = await page.screenshot({ encoding: 'binary' })
        res.setHeader('Content-Type', 'image/png')
        res.end( x );
        renderPageRenderCount += 1

    } catch (err) {
        await closeRenderPage('Discarding render page after failed render')
        console.error('Render failed:', err)
        res.status(504).send('Render timed out before the scene was ready')
    }
}

app.get('/render', function (req, res) {
    renderQueue = renderQueue.then(() => renderRequest(req, res))
})

app.get('/render_worker', function (req, res) {
    res.render('./render_worker.html')
})

app.get('/page', function (req, res) {

    var render_mode = req.query.render_mode

    var camera_distance = req.query.camera_distance
    var camera_pitch = req.query.camera_pitch
    var camera_roll = req.query.camera_roll

    var light_distance = req.query.light_distance
    var light_pitch = req.query.light_pitch
    var light_roll = req.query.light_roll

    var beak_model = req.query.beak_model
    var beak_color = req.query.beak_color

    var foot_model = req.query.foot_model

    var eye_model = req.query.eye_model

    var tail_model = req.query.tail_model
    var tail_color = req.query.tail_color

    var wing_model = req.query.wing_model
    var wing_color = req.query.wing_color

    var bg_objects = req.query.bg_objects
    var bg_radius = req.query.bg_radius
    var bg_pitch = req.query.bg_pitch
    var bg_roll = req.query.bg_roll
    var bg_scale_x = req.query.bg_scale_x
    var bg_scale_y = req.query.bg_scale_y
    var bg_scale_z = req.query.bg_scale_z
    var bg_rot_x = req.query.bg_rot_x
    var bg_rot_y = req.query.bg_rot_y
    var bg_rot_z = req.query.bg_rot_z
    var bg_color = req.query.bg_color

    console.log(beak_model)
    console.log(beak_color)

    res.render('./page.html', {render_mode: render_mode, camera_distance: camera_distance, camera_pitch: camera_pitch, camera_roll: camera_roll, light_distance:light_distance, light_pitch: light_pitch, light_roll: light_roll, beak_model: beak_model, beak_color: beak_color, foot_model: foot_model, eye_model: eye_model, tail_model: tail_model, tail_color:tail_color, wing_model: wing_model, wing_color: wing_color, bg_objects: bg_objects, bg_scale_x:bg_scale_x, bg_scale_y:bg_scale_y, bg_scale_z:bg_scale_z, bg_rot_x:bg_rot_x, bg_rot_y:bg_rot_y, bg_rot_z:bg_rot_z, bg_color:bg_color, bg_radius:bg_radius, bg_pitch:bg_pitch, bg_roll:bg_roll});
})


var server = app.listen(8081, function () {
   var host = server.address().address
   var port = server.address().port
   console.log("Example app listening at http://%s:%s", host, port)
})
