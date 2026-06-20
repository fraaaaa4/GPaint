import Cairo from 'gi://cairo';
import Gdk from 'gi://Gdk';
import GdkPixbuf from 'gi://GdkPixbuf';

// Freehand drawing
export function drawStroke(window, x, y, isMoving, isSecondary) {
    if (!window._surface) return;

    let cr = new Cairo.Context(window._surface);
    const size = window._brush_size_scale.get_value();

    // Antialiasing setup
    if (window._tool_pencil.active) {
        cr.setAntialias(Cairo.Antialias.NONE);
    } else if (window._tool_brush.active) {
        cr.setAntialias(window._opt_brush_antialias ? Cairo.Antialias.DEFAULT : Cairo.Antialias.NONE);
    } else if (window._tool_eraser.active) {
        cr.setAntialias(window._opt_eraser_type === 'pixel' ? Cairo.Antialias.NONE : Cairo.Antialias.DEFAULT);
    } else if (window._tool_highlight.active) {
        cr.setAntialias(window._opt_highlight_antialias ? Cairo.Antialias.DEFAULT : Cairo.Antialias.NONE);
    } else {
        cr.setAntialias(Cairo.Antialias.DEFAULT);
    }

    // Color and Operator setup
    const isEraser = window._tool_eraser.active;
    const eraserMode = window._opt_eraser_mode || 'solid';

    if (isEraser) {
        if (window._opt_eraser_replace === 'transparency') {
            cr.setOperator(Cairo.Operator.CLEAR);
        } else if (window._opt_eraser_replace === 'secondary') {
            const secCol = window._getCurrentColor(true);
            if (eraserMode === 'blur' || eraserMode === 'mix_blur') {
                cr.setSourceRGBA(secCol.r, secCol.g, secCol.b, 0.15);
                cr.setOperator(Cairo.Operator.OVER);
            } else {
                cr.setSourceRGBA(secCol.r, secCol.g, secCol.b, secCol.a);
                cr.setOperator(Cairo.Operator.SOURCE);
            }
        } else {
            const primCol = window._getCurrentColor(false);
            if (eraserMode === 'blur' || eraserMode === 'mix_blur') {
                cr.setSourceRGBA(primCol.r, primCol.g, primCol.b, 0.15);
                cr.setOperator(Cairo.Operator.OVER);
            } else {
                cr.setSourceRGBA(primCol.r, primCol.g, primCol.b, primCol.a);
                cr.setOperator(Cairo.Operator.SOURCE);
            }
        }
    } else {
        const col = window._getCurrentColor(isSecondary);
        if (window._tool_highlight.active) {
            const opacity = window._opt_highlight_transparency ? 0.5 : 1.0;
            cr.setSourceRGBA(col.r, col.g, col.b, opacity);
            if (window._opt_highlight_bg === 'dark') {
                cr.setOperator(Cairo.Operator.SCREEN);
            } else {
                cr.setOperator(Cairo.Operator.MULTIPLY);
            }
        } else {
            cr.setSourceRGBA(col.r, col.g, col.b, col.a);
        }
    }

    cr.setLineWidth(size);

    // Cap setup
    if (window._tool_pencil.active) {
        cr.setLineCap(window._opt_pencil_line_shape === 'round' ? Cairo.LineCap.ROUND : Cairo.LineCap.SQUARE);
    } else if (window._tool_eraser.active && window._opt_eraser_type === 'pixel') {
        cr.setLineCap(Cairo.LineCap.SQUARE);
    } else if (window._tool_highlight.active) {
        cr.setLineCap(Cairo.LineCap.SQUARE);
    } else {
        cr.setLineCap(Cairo.LineCap.ROUND);
    }
    cr.setLineJoin(Cairo.LineJoin.ROUND);

    // Pencil Outline Draw
    if (window._tool_pencil.active && window._opt_pencil_outline) {
        cr.save();
        const secCol = window._getCurrentColor(true);
        cr.setSourceRGBA(secCol.r, secCol.g, secCol.b, secCol.a);
        cr.setLineWidth(size * 1.5 + 2);
        if (isMoving) {
            cr.moveTo(window._lastX, window._lastY);
            cr.lineTo(x, y);
            cr.stroke();
        } else {
            cr.arc(x, y, (size * 1.5 + 2) / 2, 0, 2 * Math.PI);
            cr.fill();
        }
        cr.restore();
    }

    // Draw modes
    const isAirbrush = window._tool_brush.active && window._opt_brush_type === 'airbrush';
    if (isAirbrush && !isEraser) {
        const radius = size * 1.5;
        const density = Math.min(30, Math.max(5, Math.round(size)));
        for (let i = 0; i < density; i++) {
            const angle = Math.random() * 2 * Math.PI;
            const r = Math.random() * radius;
            const dotX = x + r * Math.cos(angle);
            const dotY = y + r * Math.sin(angle);

            cr.arc(dotX, dotY, 1, 0, 2 * Math.PI);
            cr.fill();
        }
    } else if (window._tool_brush.active && window._opt_brush_type === 'hairy') {
        if (isMoving) {
            const dx = x - window._lastX;
            const dy = y - window._lastY;
            const angle = Math.atan2(dy, dx) + Math.PI / 2;
            const numHairs = 5;
            const spread = size * 0.8;

            cr.save();
            cr.setLineWidth(Math.max(1, size / 5));
            for (let i = 0; i < numHairs; i++) {
                const offsetVal = ((i / (numHairs - 1)) - 0.5) * spread;
                const ox = Math.cos(angle) * offsetVal;
                const oy = Math.sin(angle) * offsetVal;

                cr.moveTo(window._lastX + ox, window._lastY + oy);
                cr.lineTo(x + ox, y + oy);
                cr.stroke();
            }
            cr.restore();
        } else {
            const numHairs = 5;
            const spread = size * 0.8;
            cr.save();
            for (let i = 0; i < numHairs; i++) {
                const offsetVal = ((i / (numHairs - 1)) - 0.5) * spread;
                cr.arc(x + offsetVal, y, Math.max(1, size / 5), 0, 2 * Math.PI);
                cr.fill();
            }
            cr.restore();
        }
    } else if (window._tool_brush.active && window._opt_brush_type === 'calligraphic') {
        const drawCalligraphicStamp = (sx, sy) => {
            cr.save();
            cr.translate(sx, sy);
            cr.rotate(Math.PI / 4);
            cr.scale(1.0, 0.25);
            cr.rectangle(-size/2, -size/2, size, size);
            cr.fill();
            cr.restore();
        };

        if (isMoving) {
            const dx = x - window._lastX;
            const dy = y - window._lastY;
            const dist = Math.sqrt(dx*dx + dy*dy);
            const step = Math.max(0.5, size / 8);
            const steps = Math.ceil(dist / step);
            for (let s = 0; s <= steps; s++) {
                const t = steps === 0 ? 0 : s / steps;
                const curX = window._lastX + dx * t;
                const curY = window._lastY + dy * t;
                drawCalligraphicStamp(curX, curY);
            }
        } else {
            drawCalligraphicStamp(x, y);
        }
    } else if (isEraser && eraserMode === 'mosaic') {
        const tileSize = Math.max(4, Math.round(size / 2));

        const drawMosaicTile = (mx, my) => {
            const tileX = Math.floor(mx / tileSize) * tileSize;
            const tileY = Math.floor(my / tileSize) * tileSize;
            cr.rectangle(tileX, tileY, tileSize, tileSize);
            cr.fill();
        };

        if (isMoving) {
            const dx = x - window._lastX;
            const dy = y - window._lastY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const steps = Math.ceil(dist / (tileSize / 2));
            for (let s = 0; s <= steps; s++) {
                const t = steps === 0 ? 0 : s / steps;
                const curX = window._lastX + dx * t;
                const curY = window._lastY + dy * t;
                drawMosaicTile(curX, curY);
            }
        } else {
            drawMosaicTile(x, y);
        }
    } else if (isEraser && (eraserMode === 'mix' || eraserMode === 'mix_blur')) {
        cr.save();
        const radius = size / 2;
        const density = Math.min(50, Math.max(10, Math.round(size * 2)));

        if (eraserMode === 'mix_blur' && window._opt_eraser_replace === 'transparency') {
            cr.setOperator(Cairo.Operator.CLEAR);
        }

        const drawMixStamp = (sx, sy) => {
            for (let i = 0; i < density; i++) {
                const angle = Math.random() * 2 * Math.PI;
                const r = Math.random() * radius;
                const dotX = sx + r * Math.cos(angle);
                const dotY = sy + r * Math.sin(angle);
                cr.rectangle(Math.floor(dotX), Math.floor(dotY), 2, 2);
                cr.fill();
            }
        };

        if (isMoving) {
            const dx = x - window._lastX;
            const dy = y - window._lastY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const steps = Math.ceil(dist / (size / 4 || 1));
            for (let s = 0; s <= steps; s++) {
                const t = steps === 0 ? 0 : s / steps;
                const curX = window._lastX + dx * t;
                const curY = window._lastY + dy * t;
                drawMixStamp(curX, curY);
            }
        } else {
            drawMixStamp(x, y);
        }
        cr.restore();
    } else {
        if (isMoving) {
            cr.moveTo(window._lastX, window._lastY);
            cr.lineTo(x, y);
            cr.stroke();
        } else {
            if (window._tool_highlight.active) {
                cr.rectangle(x - size / 2, y - size / 2, size, size);
                cr.fill();
            } else {
                cr.arc(x, y, size / 2, 0, 2 * Math.PI);
                cr.fill();
            }
        }
    }

    window._drawing_area.queue_draw();
}

export function drawRoundedRectangle(cr, x, y, w, h, radius) {
    if (w < 2 * radius) radius = w / 2;
    if (h < 2 * radius) radius = h / 2;
    cr.newSubPath();
    cr.arc(x + w - radius, y + radius, radius, -Math.PI / 2, 0);
    cr.arc(x + w - radius, y + h - radius, radius, 0, Math.PI / 2);
    cr.arc(x + radius, y + h - radius, radius, Math.PI / 2, Math.PI);
    cr.arc(x + radius, y + radius, radius, Math.PI, 3 * Math.PI / 2);
    cr.closePath();
}

// Shape drawing and previews
export function drawShapePreview(window, startX, startY, endX, endY, isSecondary) {
    if (!window._surface) return;

    let cr = new Cairo.Context(window._surface);
    const col = window._getCurrentColor(isSecondary);
    let size = window._tool_rect.active
        ? (parseInt(window._opt_shapes_outline_thickness, 10) || 2)
        : window._brush_size_scale.get_value();

    cr.setSourceRGBA(col.r, col.g, col.b, col.a);
    cr.setLineWidth(size);
    cr.setLineCap(Cairo.LineCap.ROUND);
    cr.setLineJoin(Cairo.LineJoin.ROUND);

    let w = Math.abs(startX - endX);
    let h = Math.abs(startY - endY);

    if (window._tool_line.active) {
        cr.setAntialias(window._opt_line_antialias ? Cairo.Antialias.DEFAULT : Cairo.Antialias.NONE);
        cr.setLineCap(window._opt_line_cap === 'round' ? Cairo.LineCap.ROUND : Cairo.LineCap.SQUARE);

        if (window._opt_line_locked) {
            let dx = endX - startX;
            let dy = endY - startY;
            const dist = Math.sqrt(dx*dx + dy*dy);
            const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
            endX = startX + dist * Math.cos(angle);
            endY = startY + dist * Math.sin(angle);
        }

        if (window._opt_line_outline) {
            cr.save();
            const colSec = window._getCurrentColor(true);
            cr.setSourceRGBA(colSec.r, colSec.g, colSec.b, colSec.a);
            cr.setLineWidth(size * 1.5 + 2);
            cr.moveTo(startX, startY);
            cr.lineTo(endX, endY);
            cr.stroke();
            cr.restore();
        }

        if (window._opt_line_gradient) {
            const grad = new Cairo.LinearGradient(startX, startY, endX, endY);
            grad.addColorStopRGBA(0, col.r, col.g, col.b, col.a);
            const colSec = window._getCurrentColor(true);
            grad.addColorStopRGBA(1, colSec.r, colSec.g, colSec.b, colSec.a);
            cr.setSource(grad);
        }

        cr.moveTo(startX, startY);
        cr.lineTo(endX, endY);
        cr.stroke();

        if (window._opt_line_arrows) {
            const angle = Math.atan2(endY - startY, endX - startX);
            const arrowSize = Math.max(10, size * 2);
            cr.save();
            cr.moveTo(endX, endY);
            cr.lineTo(endX - arrowSize * Math.cos(angle - Math.PI / 6), endY - arrowSize * Math.sin(angle - Math.PI / 6));
            cr.moveTo(endX, endY);
            cr.lineTo(endX - arrowSize * Math.cos(angle + Math.PI / 6), endY - arrowSize * Math.sin(angle + Math.PI / 6));
            cr.stroke();
            cr.restore();
        }

    } else if (window._tool_highlight.active && window._opt_highlight_straighten) {
        cr.setAntialias(window._opt_highlight_antialias ? Cairo.Antialias.DEFAULT : Cairo.Antialias.NONE);
        const opacity = window._opt_highlight_transparency ? 0.5 : 1.0;
        cr.setSourceRGBA(col.r, col.g, col.b, opacity);
        if (window._opt_highlight_bg === 'dark') {
            cr.setOperator(Cairo.Operator.SCREEN);
        } else {
            cr.setOperator(Cairo.Operator.MULTIPLY);
        }
        cr.setLineCap(Cairo.LineCap.SQUARE);
        cr.moveTo(startX, startY);
        cr.lineTo(endX, endY);
        cr.stroke();

    } else if (window._tool_rect.active || window._tool_oval.active || window._tool_circle.active) {
        const drawPath = () => {
            if (window._tool_rect.active) {
                const x = Math.min(startX, endX);
                const y = Math.min(startY, endY);

                const radius = Math.max(0, (window._opt_rect_roundness || window._brush_size_scale.get_value()) - 1);

                if (radius > 0) {
                    drawRoundedRectangle(cr, x, y, w, h, radius);
                } else {
                    cr.rectangle(x, y, w, h);
                }
            } else if (window._tool_oval.active) {
                const x = Math.min(startX, endX);
                const y = Math.min(startY, endY);
                cr.save();
                cr.translate(x + w / 2, y + h / 2);
                cr.scale(w / 2, h / 2);
                cr.arc(0, 0, 1, 0, 2 * Math.PI);
                cr.restore();
            } else if (window._tool_circle.active) {
                const radius = Math.min(w, h) / 2;
                const cx = startX + Math.sign(endX - startX) * radius;
                const cy = startY + Math.sign(endY - startY) * radius;
                cr.arc(cx, cy, radius, 0, 2 * Math.PI);
            }
        };

        drawPath();
        if (window._opt_shapes_fill === 'primary') {
            cr.setSourceRGBA(col.r, col.g, col.b, col.a);
            cr.fillPreserve();
        } else if (window._opt_shapes_fill === 'secondary') {
            const colSec = window._getCurrentColor(true);
            cr.setSourceRGBA(colSec.r, colSec.g, colSec.b, colSec.a);
            cr.fillPreserve();
        }

        if (window._opt_shapes_outline) {
        if (window._opt_shapes_outline_color === 'primary') {
            const colPrim = window._getCurrentColor(false);
            cr.setSourceRGBA(colPrim.r, colPrim.g, colPrim.b, colPrim.a);
        } else {
            const colSec = window._getCurrentColor(true);
            cr.setSourceRGBA(colSec.r, colSec.g, colSec.b, colSec.a);
        }
        const outlineSize = window._opt_shapes_outline_thickness || 2;
        cr.setLineWidth(outlineSize);
        cr.stroke();
    } else {
        cr.newPath();
    }

    } else if (window._tool_select_rect.active || window._tool_select_free.active) {
        const x = Math.min(startX, endX);
        const y = Math.min(startY, endY);
        cr.setDash([4, 4], 0);
        const accent = window._getAccentColor();
        cr.setSourceRGB(accent.r, accent.g, accent.b);
        cr.setLineWidth(1);
        cr.rectangle(x, y, w, h);
        cr.stroke();
    }

    window._drawing_area.queue_draw();
}

export function drawPolygonPreview(window, currentX, currentY, isSecondary) {
    if (!window._polygonPoints || window._polygonPoints.length === 0) return;

    let cr = new Cairo.Context(window._surface);
    cr.setAntialias(Cairo.Antialias.DEFAULT);
    cr.setLineCap(Cairo.LineCap.ROUND);
    cr.setLineJoin(Cairo.LineJoin.ROUND);

    const col = window._getCurrentColor(isSecondary);

    cr.moveTo(window._polygonPoints[0].x, window._polygonPoints[0].y);
    for (let i = 1; i < window._polygonPoints.length; i++) {
        cr.lineTo(window._polygonPoints[i].x, window._polygonPoints[i].y);
    }
    cr.lineTo(currentX, currentY);
    cr.closePath();

    if (window._opt_shapes_fill === 'primary') {
        const colPrim = window._getCurrentColor(false);
        cr.setSourceRGBA(colPrim.r, colPrim.g, colPrim.b, colPrim.a * 0.5);
        cr.fillPreserve();
    } else if (window._opt_shapes_fill === 'secondary') {
        const colSec = window._getCurrentColor(true);
        cr.setSourceRGBA(colSec.r, colSec.g, colSec.b, colSec.a * 0.5);
        cr.fillPreserve();
    }

    if (window._opt_shapes_outline) {
        if (window._opt_shapes_outline_color === 'primary') {
            const colPrim = window._getCurrentColor(false);
            cr.setSourceRGBA(colPrim.r, colPrim.g, colPrim.b, colPrim.a);
        } else {
            const colSec = window._getCurrentColor(true);
            cr.setSourceRGBA(colSec.r, colSec.g, colSec.b, colSec.a);
        }
        const outlineSize = window._opt_shapes_outline_thickness || 2;
        cr.setLineWidth(outlineSize);
        cr.stroke();
    } else {
        cr.newPath();
    }

    cr.save();
    cr.setSourceRGBA(1, 0, 0, 0.6);
    cr.setLineWidth(1 / window._zoomLevel);
    cr.setDash([4 / window._zoomLevel, 4 / window._zoomLevel], 0);
    cr.moveTo(window._polygonPoints[window._polygonPoints.length - 1].x, window._polygonPoints[window._polygonPoints.length - 1].y);
    cr.lineTo(currentX, currentY);
    cr.stroke();
    cr.restore();

    cr.save();
    cr.setSourceRGBA(1, 0, 0, 0.8);
    cr.arc(window._polygonPoints[0].x, window._polygonPoints[0].y, 5 / window._zoomLevel, 0, 2 * Math.PI);
    cr.fill();
    cr.restore();

    window._drawing_area.queue_draw();
}

export function drawFreeshapePreview(window, isSecondary) {
    if (!window._freeshapePoints || window._freeshapePoints.length === 0) return;

    let cr = new Cairo.Context(window._surface);
    cr.setAntialias(Cairo.Antialias.DEFAULT);
    cr.setLineCap(Cairo.LineCap.ROUND);
    cr.setLineJoin(Cairo.LineJoin.ROUND);

    const col = window._getCurrentColor(isSecondary);
    const size = window._opt_shapes_thickness || 2;
    cr.setLineWidth(size);

    cr.moveTo(window._freeshapePoints[0].x, window._freeshapePoints[0].y);
    for (let i = 1; i < window._freeshapePoints.length; i++) {
        cr.lineTo(window._freeshapePoints[i].x, window._freeshapePoints[i].y);
    }
    cr.closePath();

    if (window._opt_shapes_fill === 'primary') {
        cr.setSourceRGBA(col.r, col.g, col.b, col.a);
        cr.fillPreserve();
    } else if (window._opt_shapes_fill === 'secondary') {
        const colSec = window._getCurrentColor(true);
        cr.setSourceRGBA(colSec.r, colSec.g, colSec.b, colSec.a);
        cr.fillPreserve();
    }

    if (window._opt_shapes_outline) {
        cr.setSourceRGBA(col.r, col.g, col.b, col.a);
        cr.stroke();
    } else {
        cr.newPath();
    }

    window._drawing_area.queue_draw();
}

export function drawFreeshape(window, cr, isSecondary) {
    if (!window._freeshapePoints || window._freeshapePoints.length === 0) return;

    cr.setAntialias(Cairo.Antialias.DEFAULT);
    cr.setLineCap(Cairo.LineCap.ROUND);
    cr.setLineJoin(Cairo.LineJoin.ROUND);

    const col = window._getCurrentColor(isSecondary);
    const size = window._opt_shapes_thickness || 2;
    cr.setLineWidth(size);

    cr.moveTo(window._freeshapePoints[0].x, window._freeshapePoints[0].y);
    for (let i = 1; i < window._freeshapePoints.length; i++) {
        cr.lineTo(window._freeshapePoints[i].x, window._freeshapePoints[i].y);
    }
    cr.closePath();

    if (window._opt_shapes_fill === 'primary') {
        cr.setSourceRGBA(col.r, col.g, col.b, col.a);
        cr.fillPreserve();
    } else if (window._opt_shapes_fill === 'secondary') {
        const colSec = window._getCurrentColor(true);
        cr.setSourceRGBA(colSec.r, colSec.g, colSec.b, colSec.a);
        cr.fillPreserve();
    }

    if (window._opt_shapes_outline) {
        if (window._opt_shapes_outline_color === 'primary') {
            const colPrim = window._getCurrentColor(false);
            cr.setSourceRGBA(colPrim.r, colPrim.g, colPrim.b, colPrim.a);
        } else {
            const colSec = window._getCurrentColor(true);
            cr.setSourceRGBA(colSec.r, colSec.g, colSec.b, colSec.a);
        }
        const outlineSize = window._opt_shapes_outline_thickness || 2;
        cr.setLineWidth(outlineSize);
        cr.stroke();
    } else {
        cr.newPath();
    }
}

// Color picker
export function pickColor(window, x, y, isSecondary) {
    if (!window._surface) return;

    const width = window._surface.getWidth();
    const height = window._surface.getHeight();
    const px = Math.floor(Math.max(0, Math.min(x, width - 1)));
    const py = Math.floor(Math.max(0, Math.min(y, height - 1)));

    let pixbuf = Gdk.pixbuf_get_from_surface(window._surface, px, py, 1, 1);
    if (!pixbuf) return;
    pixbuf = fixPixbufColors(pixbuf);

    const data = pixbuf.get_pixels();
    const red = data[0];
    const green = data[1];
    const blue = data[2];

    const newColor = new Gdk.RGBA();
    newColor.parse(`rgb(${red}, ${green}, ${blue})`);

    if (isSecondary) {
        window._color_button_secondary.set_rgba(newColor);
    } else {
        window._color_button.set_rgba(newColor);
    }

    if (window._lastActiveTool) {
        window._lastActiveTool.set_active(true);
    }
}

export function fixPixbufColors(pixbuf) {
    if (!pixbuf) return pixbuf;
    const pixels = pixbuf.get_pixels();
    const nChannels = pixbuf.get_n_channels();
    const rowstride = pixbuf.get_rowstride();
    const height = pixbuf.get_height();
    const width = pixbuf.get_width();

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const offset = y * rowstride + x * nChannels;
            const r = pixels[offset];
            const b = pixels[offset + 2];
            pixels[offset] = b;
            pixels[offset + 2] = r;
        }
    }
    return pixbuf;
}

// Flood fill
export function floodFill(window, startX, startY, isSecondary) {
    if (!window._surface) return;

    const width = window._surface.getWidth();
    const height = window._surface.getHeight();
    const targetX = Math.floor(Math.max(0, Math.min(startX, width - 1)));
    const targetY = Math.floor(Math.max(0, Math.min(startY, height - 1)));

    let pixbuf = Gdk.pixbuf_get_from_surface(window._surface, 0, 0, width, height);
    if (!pixbuf) return;
    pixbuf = fixPixbufColors(pixbuf);

    const data = pixbuf.get_pixels();
    const stride = pixbuf.get_rowstride();
    const channels = pixbuf.get_n_channels();

    const getPixel = (x, y) => {
        const offset = y * stride + x * channels;
        return {
            r: data[offset],
            g: data[offset + 1],
            b: data[offset + 2],
            a: channels === 4 ? data[offset + 3] : 255 // Aggiunto il controllo Alpha
        };
    };

    const targetCol = getPixel(targetX, targetY);
    const col = window._getCurrentColor(isSecondary);

    const fillCol = {
        r: Math.round(col.r * 255),
        g: Math.round(col.g * 255),
        b: Math.round(col.b * 255),
        a: Math.round(col.a * 255)
    };

    // Ora controlla anche l'Alpha per non confondere la trasparenza col nero
    if (Math.abs(targetCol.r - fillCol.r) < 2 &&
        Math.abs(targetCol.g - fillCol.g) < 2 &&
        Math.abs(targetCol.b - fillCol.b) < 2 &&
        Math.abs(targetCol.a - fillCol.a) < 2 &&
        window._opt_fill_mode !== 'intera' && window._opt_fill_mode !== 'cancella') {
        return;
    }

    window._saveToUndoStack();
    const cr = new Cairo.Context(window._surface);
    const mode = window._opt_fill_mode || 'accerchia';

    if (mode === 'intera') {
        cr.save();
        cr.setOperator(Cairo.Operator.SOURCE);
        cr.setSourceRGBA(col.r, col.g, col.b, col.a);
        cr.paint();
        cr.restore();
    } else if (mode === 'rimuovi') {
        cr.save();
        cr.setOperator(Cairo.Operator.CLEAR);

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const p = getPixel(x, y);
                if (Math.abs(p.r - targetCol.r) < 15 && Math.abs(p.g - targetCol.g) < 15 && Math.abs(p.b - targetCol.b) < 15 && Math.abs(p.a - targetCol.a) < 15) {
                    cr.rectangle(x, y, 1, 1);
                }
            }
        }
        cr.fill();
        cr.restore();
    } else if (mode === 'cancella') {
        cr.save();
        cr.setSourceRGBA(col.r, col.g, col.b, col.a);

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const p = getPixel(x, y);
                if (Math.abs(p.r - targetCol.r) < 15 && Math.abs(p.g - targetCol.g) < 15 && Math.abs(p.b - targetCol.b) < 15 && Math.abs(p.a - targetCol.a) < 15) {
                    cr.rectangle(x, y, 1, 1);
                }
            }
        }
        cr.fill();
        cr.restore();
    } else {
        const visited = new Uint8Array(width * height);
        const queue = [[targetX, targetY]];
        visited[targetY * width + targetX] = 1;

        const match = (p) => {
            return Math.abs(p.r - targetCol.r) < 2 && Math.abs(p.g - targetCol.g) < 2 && Math.abs(p.b - targetCol.b) < 2 && Math.abs(p.a - targetCol.a) < 2;
        };

        while (queue.length > 0) {
            const [cx, cy] = queue.shift();

            let leftX = cx;
            while (leftX > 0) {
                if (visited[cy * width + (leftX - 1)]) break;
                if (match(getPixel(leftX - 1, cy))) {
                    leftX--;
                    visited[cy * width + leftX] = 1;
                } else {
                    break;
                }
            }

            let rightX = cx;
            while (rightX < width - 1) {
                if (visited[cy * width + (rightX + 1)]) break;
                if (match(getPixel(rightX + 1, cy))) {
                    rightX++;
                    visited[cy * width + rightX] = 1;
                } else {
                    break;
                }
            }

            cr.rectangle(leftX, cy, rightX - leftX + 1, 1);

            for (let x = leftX; x <= rightX; x++) {
                if (cy > 0 && !visited[(cy - 1) * width + x] && match(getPixel(x, cy - 1))) {
                    visited[(cy - 1) * width + x] = 1;
                    queue.push([x, cy - 1]);
                }
                if (cy < height - 1 && !visited[(cy + 1) * width + x] && match(getPixel(x, cy + 1))) {
                    visited[(cy + 1) * width + x] = 1;
                    queue.push([x, cy + 1]);
                }
            }
        }
        if (window._opt_fill_mode === 'gradiente' && window._activeGradient) {
            cr.setSource(window._activeGradient);
        } else {
            cr.setSourceRGBA(col.r, col.g, col.b, col.a);
        }
        cr.fill();
    }

    window._drawing_area.queue_draw();
}

export function applyGradientFill(window, startX, startY, endX, endY, isSecondary) {
    if (!window._surface) return;

    window._saveToUndoStack();

    const colPrim = window._getCurrentColor(false);
    const colSec = window._getCurrentColor(true);

    if (Math.abs(startX - endX) < 2 && Math.abs(startY - endY) < 2) {
        endY = startY - 50;
    }

    const gradient = new Cairo.LinearGradient(startX, startY, endX, endY);
    gradient.addColorStopRGBA(0.0, colPrim.r, colPrim.g, colPrim.b, colPrim.a);
    gradient.addColorStopRGBA(1.0, colSec.r, colSec.g, colSec.b, colSec.a);

    window._activeGradient = gradient;

    floodFill(window, startX, startY, isSecondary);

    window._activeGradient = null;
}

export function drawFreeSelectionPreview(window) {
    if (!window._freeSelectionPoints || window._freeSelectionPoints.length === 0) return;

    let cr = new Cairo.Context(window._surface);
    cr.setAntialias(Cairo.Antialias.DEFAULT);

    const accent = window._getAccentColor();
    cr.setSourceRGB(accent.r, accent.g, accent.b);
    cr.setLineWidth(1 / window._zoomLevel);
    cr.setDash([4 / window._zoomLevel, 4 / window._zoomLevel], 0);

    cr.moveTo(window._freeSelectionPoints[0].x, window._freeSelectionPoints[0].y);
    for (let i = 1; i < window._freeSelectionPoints.length; i++) {
        cr.lineTo(window._freeSelectionPoints[i].x, window._freeSelectionPoints[i].y);
    }
    cr.closePath();
    cr.stroke();

    window._drawing_area.queue_draw();
}

