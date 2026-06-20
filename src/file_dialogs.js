import Gtk from 'gi://Gtk';
import Cairo from 'gi://cairo';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gettext from 'gettext';

const _ = Gettext.gettext;

export function addFileDialogFilters(dialog) {
    const filterList = new Gio.ListStore({ item_type: Gtk.FileFilter });

    const filterPng = new Gtk.FileFilter();
    filterPng.set_name("PNG Image (*.png)");
    filterPng.add_mime_type("image/png");
    filterPng.add_pattern("*.png");
    filterList.append(filterPng);

    const filterJpeg = new Gtk.FileFilter();
    filterJpeg.set_name("JPEG Image (*.jpg, *.jpeg)");
    filterJpeg.add_mime_type("image/jpeg");
    filterJpeg.add_pattern("*.jpg");
    filterJpeg.add_pattern("*.jpeg");
    filterList.append(filterJpeg);

    const filterBmp = new Gtk.FileFilter();
    filterBmp.set_name("BMP Image (*.bmp)");
    filterBmp.add_mime_type("image/bmp");
    filterBmp.add_pattern("*.bmp");
    filterList.append(filterBmp);

    const filterAll = new Gtk.FileFilter();
    filterAll.set_name("All Files");
    filterAll.add_pattern("*");
    filterList.append(filterAll);

    dialog.set_filters(filterList);
}

/**
 * Write a Cairo.ImageSurface to a Gio.File.
 * - PNG  → surface.writeToPNG(tmpPath) then Gio copy to destination.
 * Avoids GdkPixbuf/Glycin entirely.
 * - JPEG/BMP → composite onto opaque background, then GdkPixbuf.savev().
 */
function _writeSurfaceToFile(surface, file, pref_save_mode, pref_save_color) {
    const width  = surface.getWidth();
    const height = surface.getHeight();

    const path  = file.get_path() || file.get_uri();
    const lower = path.toLowerCase();

    const isOpaqueFormat = lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.bmp');
    const isPng = lower.endsWith('.png');

    // --- PNG: writeToPNG → tmp file → Gio copy to destination ---
    // writeToPNG exists in GJS Cairo.
    // We write to XDG_RUNTIME_DIR which is always writable in Flatpak,
    // then copy to the user-chosen destination with Gio (which only uses
    // Glycin for *reading*, not writing raw bytes).
    if (isPng) {
        const tmpDir  = GLib.get_tmp_dir();
        const tmpName = `gpaint-${GLib.get_monotonic_time()}.png`;
        const tmpPath = GLib.build_filenamev([tmpDir, tmpName]);
        try {
            surface.writeToPNG(tmpPath); // CORRETTO: writeToPNG maiuscolo
            // Read the PNG bytes back and write via Gio stream to destination.
            // This is a plain byte copy — Glycin is never involved in writes.
            const [ok, contents] = GLib.file_get_contents(tmpPath);
            GLib.unlink(tmpPath);
            if (!ok || !contents) {
                console.error("Impossibile leggere il file PNG temporaneo.");
                return false;
            }
            const bytes  = new GLib.Bytes(contents);
            const stream = file.replace(null, false, Gio.FileCreateFlags.NONE, null);
            stream.write_bytes(bytes, null);
            stream.flush(null);
            stream.close(null);
            return true;
        } catch (err) {
            console.error("Errore durante la scrittura del PNG:", err);
            GLib.unlink(tmpPath);
            return false;
        }
    }

    // --- JPEG / BMP: composite onto background first, then GdkPixbuf ---
    let finalSurface = new Cairo.ImageSurface(Cairo.Format.ARGB32, width, height);
    const cr = new Cairo.Context(finalSurface);
    cr.setOperator(Cairo.Operator.SOURCE);
    if (pref_save_mode === 'color') {
        cr.setSourceRGBA(
            pref_save_color.red, pref_save_color.green,
            pref_save_color.blue, pref_save_color.alpha
        );
        cr.paint();
    } else {
        cr.setSourceRGB(1.0, 1.0, 1.0);
        cr.rectangle(0, 0, width, height);
        cr.fill();
        cr.setSourceRGB(0.93, 0.93, 0.93);
        const checkerSize = 8;
        for (let y = 0; y < height; y += checkerSize) {
            const startX = (Math.floor(y / checkerSize) % 2 === 0) ? 0 : checkerSize;
            for (let x = startX; x < width; x += checkerSize * 2) {
                cr.rectangle(x, y,
                    Math.min(checkerSize, width  - x),
                    Math.min(checkerSize, height - y));
            }
        }
        cr.fill();
    }
    cr.setOperator(Cairo.Operator.OVER);
    cr.setSourceSurface(surface, 0, 0);
    cr.paint();

    const destPath = file.get_path();
    if (!destPath) {
        console.error("Impossibile ottenere il path del file di destinazione.");
        return false;
    }

    const pixbuf = Gdk.pixbuf_get_from_surface(finalSurface, 0, 0, width, height);
    if (!pixbuf) {
        console.error("pixbuf_get_from_surface ha restituito null.");
        return false;
    }

    const saveFormat = lower.endsWith('.bmp') ? 'bmp' : 'jpeg';
    try {
        pixbuf.savev(destPath, saveFormat, [], []);
        return true;
    } catch (err) {
        console.error("Errore durante la scrittura del file:", err);
        return false;
    }
}

// Save to file
export function saveCanvasToFile(window, onSavedCallback = null) {
    window._bakeSelection();
    if (!window._surface) return;

    const doWrite = (file) => {
        const ok = _writeSurfaceToFile(
            window._surface, file,
            window._pref_save_mode, window._pref_save_color
        );
        if (ok) {
            window._saveFilePath = file.get_path() || file.get_uri();
            window._saveGioFile  = file;
            window._isModified   = false;
            window._updateTitle();
            if (onSavedCallback) onSavedCallback();
        }
    };

    if (window._saveGioFile) {
        try {
            doWrite(window._saveGioFile);
        } catch (err) {
            console.error("Error direct saving:", err);
        }
        return;
    }

    const dialog = new Gtk.FileDialog({
        title: _('Save drawing'),
        initial_name: window._suggestedFileName || 'drawing.png'
    });
    addFileDialogFilters(dialog);

    dialog.save(window, null, (source, result) => {
        try {
            const file = source.save_finish(result);
            if (file) doWrite(file);
        } catch (err) {
            console.error("Error while saving:", err);
        }
    });
}

export function saveCanvasToFileAs(window, onSavedCallback = null) {
    window._bakeSelection();
    if (!window._surface) return;

    const doWrite = (file) => {
        const ok = _writeSurfaceToFile(
            window._surface, file,
            window._pref_save_mode, window._pref_save_color
        );
        if (ok) {
            window._saveFilePath = file.get_path() || file.get_uri();
            window._saveGioFile  = file;
            window._isModified   = false;
            window._updateTitle();
            if (onSavedCallback) onSavedCallback();
        }
    };

    const dialog = new Gtk.FileDialog({
        title: _('Save drawing as'),
        initial_name: window._saveGioFile
            ? window._saveGioFile.get_basename()
            : (window._suggestedFileName || 'drawing.png')
    });
    addFileDialogFilters(dialog);

    dialog.save(window, null, (source, result) => {
        try {
            const file = source.save_finish(result);
            if (file) doWrite(file);
        } catch (err) {
            console.error("Error while saving as:", err);
        }
    });
}

export function openImageFromFile(window) {
    window._confirmUnsaved(() => {
        const dialog = new Gtk.FileDialog({
            title: _('Open image')
        });
        addFileDialogFilters(dialog);

        dialog.open(window, null, (source, result) => {
            try {
                const file = source.open_finish(result);
                if (file) window._loadImage(file);
            } catch (err) {
                console.error("Error opening file:", err);
            }
        });
    });
}

export function importImage(window) {
    const dialog = new Gtk.FileDialog({
        title: _('Import Image')
    });
    addFileDialogFilters(dialog);

    dialog.open(window, null, (source, result) => {
        try {
            const file = source.open_finish(result);
            if (file) {
                const texture = Gdk.Texture.new_from_file(file);
                if (texture) {
                    const pixbuf = Gdk.pixbuf_get_from_texture(texture);
                    if (pixbuf) {
                        window._bakeSelection();
                        window._saveToUndoStack();

                        const w = pixbuf.get_width();
                        const h = pixbuf.get_height();

                        window._selectionSurface = new Cairo.ImageSurface(Cairo.Format.ARGB32, w, h);
                        const cr = new Cairo.Context(window._selectionSurface);
                        Gdk.cairo_set_source_pixbuf(cr, pixbuf, 0, 0);
                        cr.paint();

                        window._selectionRect = { x: 20, y: 20, w, h };
                        window._selectionActive = true;
                        window._updateTransformButtonsSensitivity();
                        window._updateActiveGroupStyle();
                        window._updateColorButtonsSensitivity();
                        window._drawing_area.queue_draw();
                    }
                }
            }
        } catch (err) {
            console.error("Error importing image:", err);
        }
    });
}

export function shareImageFlatpak(window) {
    if (!window._saveFilePath) {
        // CORREZIONE: Chiama la funzione locale, non window._saveCanvasToFileAs
        saveCanvasToFileAs(window, () => {
            if (window._saveFilePath) shareImageFlatpak(window);
        });
        return;
    }

    try {
        const file = Gio.File.new_for_path(window._saveFilePath);

        // Gtk.FileLauncher gestisce in automatico il portale Flatpak e i permessi
        const launcher = new Gtk.FileLauncher({
            file: file,
            always_ask: true // Forza il menu "Condividi / Apri con..." del sistema
        });

        launcher.launch(window, null, (source, result) => {
            try {
                source.launch_finish(result);
            } catch (err) {
                console.error("Errore nel portale di condivisione:", err.message);
            }
        });
    } catch (err) {
        console.error("Impossibile avviare la condivisione Flatpak:", err);
    }
}
