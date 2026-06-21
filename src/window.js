import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';
import Cairo from 'gi://cairo';
import Gdk from 'gi://Gdk';
import GdkPixbuf from 'gi://GdkPixbuf';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gettext from 'gettext';

const _ = Gettext.gettext;
const MAX_UNDO_STAGES = 10;
        const System = imports.system;
import { showPreferencesWindow } from './preferences.js';
import { shareImageFlatpak, importImage, saveCanvasToFileAs, openImageFromFile, saveCanvasToFile, addFileDialogFilters } from './file_dialogs.js';
import { applyGradientFill, drawFreeSelectionPreview, drawStroke, drawRoundedRectangle, drawShapePreview, drawPolygonPreview, drawFreeshapePreview, drawFreeshape, drawHighlightStroke, pickColor, fixPixbufColors, floodFill } from './draw_tools.js';

export const GnomepaintWindow = GObject.registerClass({
    GTypeName: 'GnomepaintWindow',
    Template: 'resource:///org/fratta/gpaint/window.ui',
    InternalChildren: [
        'drawing_area',
        'main_layout',
        'toolbar_box',
        'btn_new',
        'popover_new',
        'entry_width',
        'entry_height',
        'btn_new_apply',
        'btn_new_bg_color',
        'chk_new_transparent',
        'btn_undo',
        'btn_redo',
        'btn_clear',
        'btn_save',
        'btn_open',
        'btn_toggle_position',
        'img_selection',
        'img_paint',
        'img_shapes',
        'tool_select_rect',
        'tool_select_free',
        'btn_select_all',
        'tool_brush',
        'tool_pencil',
        'tool_polygon',
        'tool_freeshape',
        'tool_eraser',
        'tool_bucket',
        'tool_picker',
        'tool_line',
        'tool_rect',
        'tool_oval',
        'tool_circle',
        'tool_highlight',
        'tool_text',
        'brush_size_scale',
        'color_button',
        'color_button_secondary',
        'img_thickness',
        'btn_thickness',
        'popover_primary',
        'theme_btn_system',
        'theme_btn_light',
        'theme_btn_dark',
        'theme_img_system',
        'theme_img_light',
        'theme_img_dark',
        'btn_swap_colors',
        'menu_btn_save_as',
        'menu_btn_new_window',
        'menu_btn_shortcuts',
        'menu_btn_properties',
        'menu_btn_print',
        'menu_btn_preferences',
        'menu_btn_about',
        'menu_btn_close',
        'btn_import',
        'btn_status_dims',
        'popover_dims',
        'combo_dims_unit',
        'entry_dims_width',
        'entry_dims_height',
        'btn_dims_apply',
        'btn_status_zoom',
        'popover_zoom',
        'btn_zoom_out',
        'scale_zoom',
        'btn_zoom_in',
        'entry_zoom_value',
        'btn_zoom_reset',
        'btn_options',
        'popover_options',
        'box_options',
        'btn_selection',
        'btn_paint',
        'btn_shapes',
        'popover_selection',
        'popover_paint',
        'popover_shapes',
        'popover_thickness',
        'lbl_toolbar_selection',
        'lbl_toolbar_paint',
        'lbl_toolbar_shapes',
        'lbl_toolbar_options',
        'lbl_toolbar_thickness',
        'lbl_tool_brush',
        'lbl_tool_pencil',
        'lbl_tool_highlight',
        'lbl_tool_eraser',
        'lbl_tool_bucket',
        'lbl_tool_picker',
        'lbl_tool_text',
        'lbl_tool_line',
        'lbl_tool_rect',
        'lbl_tool_oval',
        'lbl_tool_circle',
        'lbl_tool_polygon',
        'lbl_tool_freeshape',
        'chk_show_labels',
        'chk_center_canvas',
        'chk_status_bar',
        'chk_show_grid',
        'chk_pixel_view',
        'status_bar',
        'canvas_overlay',
        'scrolled_window',
        'lbl_status_coords',
        'lbl_status_dims',
        'lbl_status_zoom',
        'btn_new_clipboard',
        'btn_title',
        'lbl_title',
        'popover_rename',
        'entry_rename',
        'btn_rename_apply',
        'box_rename_unsaved',
        'box_rename_saved',
        'lbl_rename_path',
        'btn_rename_open_folder',
        'btn_rename_copy_path',
        'lbl_brush_size_title',
        'menu_btn_share'
    ],
}, class GnomepaintWindow extends Adw.ApplicationWindow {
    constructor(application) {
        super({ application });

        try {
            const builder = Gtk.Builder.new_from_resource('/org/fratta/gpaint/shortcuts-dialog.ui');
            const dialog = builder.get_object('shortcuts_dialog');
            this.set_help_overlay(dialog);
        } catch (err) {
            console.error("Error setting help overlay:", err);
        }

        // Add local icon directory to GTK icon theme
        const display = Gdk.Display.get_default();
        const iconTheme = Gtk.IconTheme.get_for_display(display);
        iconTheme.add_resource_path('/org/fratta/gpaint/icons');

        // Custom CSS for menu styling and theme buttons
        this._cssProvider = new Gtk.CssProvider();
        this._updateDynamicCss();
        Gtk.StyleContext.add_provider_for_display(display, this._cssProvider, Gtk.STYLE_PROVIDER_PRIORITY_USER);

        // Internal drawing state
        this._surface = null;        // Main canvas surface
        this._backupSurface = null;  // Backup surface for shape preview
        this._lastX = 0;             // Previous coordinates
        this._lastY = 0;
        this._startX = 0;            // Click start coordinates
        this._startY = 0;
        this._isDrawing = false;
        this._isSecondaryDrag = false;
        this._motionCount = 0;

        // Current canvas dimensions
        this._canvasWidth = 0;
        this._canvasHeight = 0;

        // Current zoom level
        this._zoomLevel = 1.0;
        this._zoomStartLevel = 1.0;

        // Selection state
        this._selectionActive = false;
        this._selectionRect = { x: 0, y: 0, w: 0, h: 0 };
        this._selectionStartRect = { x: 0, y: 0, w: 0, h: 0 };
        this._selectionSurface = null;
        this._transformButtons = null;
        this._clipboardSurface = null;
        this._isMovingSelection = false;
        this._isResizingSelection = false;
        this._resizeHandleIndex = -1;

        // Undo/redo stacks
        this._lastActiveTool = this._tool_pencil;

        // Toolbar state
        this._toolbarAtTop = true;

        // Tool options
        this._opt_pencil_line_shape = 'round'; // round, square
        this._opt_pencil_outline = false;
        this._opt_pencil_antialias = true;

        this._opt_brush_type = 'simple'; // simple, airbrush, hairy, calligraphic
        this._opt_brush_antialias = true;

        this._opt_eraser_type = 'normal'; // normal, pixel
        this._opt_eraser_mode = 'solid'; // solid, blur, mix, mix_blur, mosaic
        this._opt_eraser_replace = 'transparency'; // transparency, default, secondary

        this._opt_highlight_transparency = true;
        this._opt_highlight_straighten = false;
        this._opt_highlight_bg = 'light'; // light, dark
        this._opt_highlight_antialias = true;

        this._opt_text_font = 'Sans';
        this._opt_text_size = 24;

        // Preferences state
        this._pref_clear_mode = 'transparent'; // primary, secondary, color, transparent
        this._pref_clear_confirm = true;
        this._pref_clear_color = new Gdk.RGBA();
        this._pref_clear_color.parse('white');
        this._pref_save_mode = 'checkerboard'; // color, checkerboard
        this._pref_save_color = new Gdk.RGBA();
        this._pref_save_color.parse('white');
        this._pref_grid_step = 10;
        this._pref_grid_color = new Gdk.RGBA();
        this._pref_grid_color.parse('rgba(0,0,0,0.12)');
        this._opt_text_bg = false;
        this._opt_text_shadow = false;
        this._opt_text_outline = 'none'; // none, thin, thick
        this._opt_text_antialias = true;
        this._opt_text_bold = false;
        this._opt_text_italic = false;
        this._opt_text_underline = false;
        this._opt_text_strikethrough = false;
        this._opt_text_content = _('Text');

        this._opt_points_shape = 'circle'; // circle, cross, xcross, square
        this._opt_points_number = false;
        this._opt_points_count = 1;

        this._opt_line_cap = 'round'; // round, square
        this._opt_line_gradient = false;
        this._opt_line_outline = false;
        this._opt_line_locked = false;
        this._opt_line_arrows = false;
        this._opt_line_antialias = true;

        this._opt_shapes_fill = 'empty'; // empty, primary, secondary
        this._opt_shapes_outline = true;
        this._opt_shapes_outline_thickness = 2;
        this._opt_shapes_outline_color = 'secondary';

        this._opt_fill_mode = 'accerchia'; // options: encircle, erase, whole, remove
        this._opt_select_mode = 'standard'; // standard, transparent, invert

        // View options
        this._showGrid = false;
        this._pixelView = false;

        // Text editor state
        this._activeTextEditor = null;
        this._activeTextTextView = null;
        this._textEditorCssProvider = null;
        this._isDraggingTextRect = false;

        // File tracking
        this._saveGioFile = null;

        // Setup drawing area
        this._setupDrawingArea();

        // Connect mouse gestures and zoom
        this._setupDragGesture();
        this._setupZoomGesture();

        // Gradient fill
        this._gradientAngle = 0;
        this._gradientTimeoutId = 0;
        this._isGradientActive = false;
        this._gradientStartX = 0;
        this._gradientStartY = 0;

        // Action buttons
        this._btn_clear.connect('clicked', () => {
            if (this._pref_clear_confirm) {
                const dialog = new Adw.MessageDialog({
                    transient_for: this,
                    heading: _("Clear Canvas?"),
                    body: _("Are you sure you want to clear the entire image? This action can be undone."),
                    close_response: "cancel"
                });
                dialog.add_response("cancel", _("Cancel"));
                dialog.add_response("clear", _("Clear All"));
                dialog.set_response_appearance("clear", Adw.ResponseAppearance.DESTRUCTIVE);

                dialog.connect('response', (self, response) => {
                    if (response === 'clear') {
                        this._bakeSelection();
                        this._saveToUndoStack();
                        this._clearCanvas();
                    }
                    dialog.destroy();
                    System.gc();
                });
                dialog.present();
            } else {
                this._bakeSelection();
                this._saveToUndoStack();
                this._clearCanvas();
            }
        });
        this._btn_save.connect('clicked', () => this._saveCanvasToFile());
        this._btn_open.connect('clicked', () => this._openImageFromFile());

        this._btn_undo.connect('clicked', () => this._undo());
        this._btn_redo.connect('clicked', () => this._redo());
        this._btn_toggle_position.connect('clicked', () => this._toggleToolbarPosition());
        this._btn_select_all.connect('clicked', () => this._selectAll());

        // Check for transparent background in New menu
        this._chk_new_transparent.connect('toggled', () => {
            this._btn_new_bg_color.set_sensitive(!this._chk_new_transparent.active);
        });

        // New drawing
        this._btn_new_apply.connect('clicked', () => {
            this._confirmUnsaved(() => {
                const w = parseInt(this._entry_width.get_text()) || 800;
                const h = parseInt(this._entry_height.get_text()) || 600;
                const bgColor = this._chk_new_transparent.active ? 'transparent' : this._btn_new_bg_color.get_rgba();
                this._bakeSelection();
                this._initSurface(w, h, bgColor);
            });
            this._popover_new.popdown();
        });

        // Image sharing
        this._menu_btn_share.connect('clicked', () => {
    this._bakeSelection();
    shareImageFlatpak(this);
    this._popover_primary.popdown();
});


        // Update button icon based on selected tool
        const tools = [
            this._tool_select_rect, this._tool_select_free,
            this._tool_brush, this._tool_pencil, this._tool_highlight, this._tool_eraser, this._tool_bucket, this._tool_picker,
            this._tool_text,
            this._tool_line, this._tool_rect, this._tool_oval, this._tool_circle,
            this._tool_polygon, this._tool_freeshape
        ];
        for (const t of tools) {
            t.connect('notify::active', () => {
                if (t.active) {
                    if (t !== this._tool_picker) {
                        this._lastActiveTool = t;
                    }
                    if (this._polygonPoints && this._polygonPoints.length > 0) {
                        this._bakePolygon(false);
                    }
                    this._updateToolIcons();
                    this._updateToolOptions();
                    this._updateActiveGroupStyle();
                    this._updateColorButtonsSensitivity();
                    this._updateThicknessSliderTitle();
                }
            });
        }
        this._updateToolIcons();
        this._updateToolOptions();
        this._updateActiveGroupStyle();
        this._updateColorButtonsSensitivity();
        this._updateThicknessSliderTitle();

        this._brush_size_scale.connect('value-changed', () => {
            this._updateThicknessIcon(this._brush_size_scale.get_value());
        });
        this._updateThicknessIcon(this._brush_size_scale.get_value());

        // Zoom actions for primary menu
        const zoomInAction = new Gio.SimpleAction({ name: 'zoom_in' });
        zoomInAction.connect('activate', () => this._zoom(1.2));
        this.add_action(zoomInAction);

        const zoomOutAction = new Gio.SimpleAction({ name: 'zoom_out' });
        zoomOutAction.connect('activate', () => this._zoom(0.8));
        this.add_action(zoomOutAction);

        const zoomResetAction = new Gio.SimpleAction({ name: 'zoom_reset' });
        zoomResetAction.connect('activate', () => {
            this._zoomLevel = 1.0;
            this._updateCanvasSizeRequest();
            this._drawing_area.queue_draw();
        });
        this.add_action(zoomResetAction);

        // Theme buttons (System, Light, Dark)
        const styleManager = Adw.StyleManager.get_default();
        this._theme_btn_system.connect('clicked', () => {
            styleManager.color_scheme = Adw.ColorScheme.DEFAULT;
        });
        this._theme_btn_light.connect('clicked', () => {
            styleManager.color_scheme = Adw.ColorScheme.FORCE_LIGHT;
        });
        this._theme_btn_dark.connect('clicked', () => {
            styleManager.color_scheme = Adw.ColorScheme.FORCE_DARK;
        });

        // Listen for theme changes to update active check
        this._styleManagerSignalId = styleManager.connect('notify::color-scheme', () => {
        this._cachedAccentColor = null;
    this._updateThemeSelection();
    this._updateDynamicCss();
});
        this._updateThemeSelection();

        // Swap colors button
        this._btn_swap_colors.connect('clicked', () => {
            const primary = this._color_button.get_rgba();
            const secondary = this._color_button_secondary.get_rgba();
            this._color_button.set_rgba(secondary);
            this._color_button_secondary.set_rgba(primary);
        });

        // Zoom controls in the status bar popover
        this._btn_zoom_in.connect('clicked', () => {
            this._zoom(1.2);
        });
        this._btn_zoom_out.connect('clicked', () => {
            this._zoom(0.8);
        });
        this._btn_zoom_reset.connect('clicked', () => {
            this._zoomLevel = 1.0;
            this._updateCanvasSizeRequest();
            this._drawing_area.queue_draw();
            this._updateStatusZoom();
        });
        this._entry_zoom_value.set_text(Math.round(this._zoomLevel * 100) + '%');
        this._entry_zoom_value.connect('activate', () => {
            const text = this._entry_zoom_value.get_text().replace('%', '').trim();
            const pct = parseFloat(text);
            if (!isNaN(pct)) {
                let zoom = pct / 100;
                this._zoomLevel = Math.max(0.1, Math.min(20.0, zoom));
                this._updateCanvasSizeRequest();
                this._drawing_area.queue_draw();
                this._updateStatusZoom();
            } else {
                this._entry_zoom_value.set_text(Math.round(this._zoomLevel * 100) + '%');
            }
        });
        this._scale_zoom.get_adjustment().connect('value-changed', (adj) => {
            const val = adj.get_value();
            if (Math.abs(this._zoomLevel - val) > 0.001) {
                this._zoomLevel = val;
                this._updateCanvasSizeRequest();
                this._drawing_area.queue_draw();
                if (this._lbl_status_zoom) {
                    this._lbl_status_zoom.set_label(`${Math.round(this._zoomLevel * 100)}%`);
                }
                if (this._entry_zoom_value) {
                    this._entry_zoom_value.set_text(`${Math.round(this._zoomLevel * 100)}%`);
                }
            }
        });

        // Resize Canvas/Image status bar popover
        let lastUnit = 'px';
        this._popover_dims.connect('show', () => {
            this._combo_dims_unit.set_active_id('px');
            lastUnit = 'px';
            this._entry_dims_width.set_text(this._canvasWidth.toString());
            this._entry_dims_height.set_text(this._canvasHeight.toString());
        });

        this._combo_dims_unit.connect('changed', () => {
            const newUnit = this._combo_dims_unit.get_active_id();
            if (newUnit === lastUnit) return;
            const wVal = parseFloat(this._entry_dims_width.get_text()) || 0;
            const hVal = parseFloat(this._entry_dims_height.get_text()) || 0;
            const PX_PER_CM = 96 / 2.54;
            if (newUnit === 'cm') {
                const wCm = wVal / PX_PER_CM;
                const hCm = hVal / PX_PER_CM;
                this._entry_dims_width.set_text(wCm.toFixed(2));
                this._entry_dims_height.set_text(hCm.toFixed(2));
            } else {
                const wPx = Math.round(wVal * PX_PER_CM);
                const hPx = Math.round(hVal * PX_PER_CM);
                this._entry_dims_width.set_text(wPx.toString());
                this._entry_dims_height.set_text(hPx.toString());
            }
            lastUnit = newUnit;
        });

        this._btn_dims_apply.connect('clicked', () => {
            const unit = this._combo_dims_unit.get_active_id();
            const wVal = parseFloat(this._entry_dims_width.get_text()) || 0;
            const hVal = parseFloat(this._entry_dims_height.get_text()) || 0;
            const PX_PER_CM = 96 / 2.54;
            let wPx = wVal;
            let hPx = hVal;
            if (unit === 'cm') {
                wPx = Math.round(wVal * PX_PER_CM);
                hPx = Math.round(hVal * PX_PER_CM);
            } else {
                wPx = Math.round(wPx);
                hPx = Math.round(hPx);
            }
            if (wPx > 0 && hPx > 0) {
                this._saveToUndoStack();
                this._resizeCanvasSurface(wPx, hPx);
            }
            this._popover_dims.popdown();
        });

        // Activate / Enter triggers in New and Resize entries
        const triggerNewCanvas = () => {
            this._confirmUnsaved(() => {
                const w = parseInt(this._entry_width.get_text()) || 800;
                const h = parseInt(this._entry_height.get_text()) || 600;
                const bgColor = this._chk_new_transparent.active ? 'transparent' : this._btn_new_bg_color.get_rgba();
                this._bakeSelection();
                this._initSurface(w, h, bgColor);
            });
            this._popover_new.popdown();
        };
        this._entry_width.connect('activate', triggerNewCanvas);
        this._entry_height.connect('activate', triggerNewCanvas);

        const triggerResizeCanvas = () => {
            const unit = this._combo_dims_unit.get_active_id();
            const wVal = parseFloat(this._entry_dims_width.get_text()) || 0;
            const hVal = parseFloat(this._entry_dims_height.get_text()) || 0;
            const PX_PER_CM = 96 / 2.54;
            let wPx = wVal;
            let hPx = hVal;
            if (unit === 'cm') {
                wPx = Math.round(wVal * PX_PER_CM);
                hPx = Math.round(hVal * PX_PER_CM);
            } else {
                wPx = Math.round(wPx);
                hPx = Math.round(hPx);
            }
            if (wPx > 0 && hPx > 0) {
                this._saveToUndoStack();
                this._resizeCanvasSurface(wPx, hPx);
            }
            this._popover_dims.popdown();
        };
        this._entry_dims_width.connect('activate', triggerResizeCanvas);
        this._entry_dims_height.connect('activate', triggerResizeCanvas);

        // Import Image button
        this._btn_import.connect('clicked', () => {
            this._importImage();
            this._popover_selection.popdown();
        });

        // Menu items Properties and Print
        this._menu_btn_properties.connect('clicked', () => {
            this._showProperties();
            this._popover_primary.popdown();
        });
        this._menu_btn_print.connect('clicked', () => {
            this._printImage();
            this._popover_primary.popdown();
        });
        this._menu_btn_preferences.connect('clicked', () => {
            this._showPreferencesWindow();
            this._popover_primary.popdown();
        });

        this._menu_btn_shortcuts.connect('clicked', () => {
            this._showShortcutsDialog();
            this._popover_primary.popdown();
        });
        this._menu_btn_save_as.connect('clicked', () => {
            this._saveCanvasToFileAs();
            this._popover_primary.popdown();
        });
        this._menu_btn_about.connect('clicked', () => {
            this.get_application().activate_action('about', null);
            this._popover_primary.popdown();
        });
        this._menu_btn_close.connect('clicked', () => {
            this.close();
        });

        // Keyboard shortcuts
        const keyController = new Gtk.EventControllerKey();
        keyController.connect('key-pressed', (controller, keyval, keycode, state) => {
            const isCtrl = (state & Gdk.ModifierType.CONTROL_MASK) !== 0;
            const keyName = Gdk.keyval_name(keyval);

            if (isCtrl) {
                if (keyName === 'n' || keyName === 'N') {
                    this._confirmUnsaved(() => {
                        const w = parseInt(this._entry_width.get_text()) || 800;
                        const h = parseInt(this._entry_height.get_text()) || 600;
                        const bgColor = this._chk_new_transparent.active ? 'transparent' : this._btn_new_bg_color.get_rgba();
                        this._bakeSelection();
                        this._initSurface(w, h, bgColor);
                    });
                    return true;
                }
                if (keyName === 'a' || keyName === 'A') {
                    this._selectAll();
                    return true;
                }
                if (keyName === 'o' || keyName === 'O') {
                    this._openImageFromFile();
                    return true;
                }
                if (keyName === 's' || keyName === 'S') {
                    this._saveCanvasToFile();
                    return true;
                }
                if (keyName === 'p' || keyName === 'P') {
                    this._printImage();
                    return true;
                }
                if (keyName === 'c' || keyName === 'C') {
                    this._copySelection();
                    return true;
                }
                if (keyName === 'x' || keyName === 'X') {
                    this._cutSelection();
                    return true;
                }
                if (keyName === 'v' || keyName === 'V') {
                    this._pasteSelection();
                    return true;
                }
                if (keyName === 'z' || keyName === 'Z') {
                    this._undo();
                    return true;
                }
                if (keyName === 'y' || keyName === 'Y') {
                    this._redo();
                    return true;
                }
                if (keyName === 'plus' || keyName === 'equal') {
                    this._zoom(1.2);
                    return true;
                }
                if (keyName === 'minus') {
                    this._zoom(0.8);
                    return true;
                }
                if (keyName === '0') {
                    this._zoomLevel = 1.0;
                    this._updateCanvasSizeRequest();
                    this._drawing_area.queue_draw();
                    return true;
                }
                if (keyName === 'q' || keyName === 'Q') {
                    this.close();
                    return true;
                }
                if (keyName === 'question') {
                    this._showShortcutsDialog();
                    return true;
                }
            } else {
                // Ignore single key shortcuts if drawing text editor is active or inside a text input
                const focus = this.get_focus();
                if (focus instanceof Gtk.Entry || focus instanceof Gtk.TextView || this._activeTextEditor) {
                    return false;
                }

                const lKey = keyName ? keyName.toLowerCase() : '';
                if (lKey === 'p') {
                    this._tool_pencil.set_active(true);
                    return true;
                } else if (lKey === 'b') {
                    this._tool_brush.set_active(true);
                    return true;
                } else if (lKey === 'e') {
                    this._tool_eraser.set_active(true);
                    return true;
                } else if (lKey === 'c') {
                    this._tool_picker.set_active(true);
                    return true;
                } else if (lKey === 'f') {
                    this._tool_bucket.set_active(true);
                    return true;
                } else if (lKey === 's') {
                    this._tool_select_rect.set_active(true);
                    return true;
                } else if (lKey === 't') {
                    this._tool_text.set_active(true);
                    return true;
                }
            }

            if (keyName === 'Delete' || keyName === 'BackSpace') {
                this._deleteSelection();
                return true;
            }

            if (keyName === 'Escape') {
                let handled = false;
                if (this._selectionActive) {
                    this._bakeSelection();
                    handled = true;
                }
                if (this._activeTextEditor) {
                    this._activeTextEditor.unparent();
                    this._activeTextEditor = null;
                    this._activeTextTextView = null;
                    this._drawing_area.queue_draw();
                    handled = true;
                }
                if (this._polygonPoints && this._polygonPoints.length > 0) {
                    if (this._surface && this._backupSurface) {
                        let restoreCr = new Cairo.Context(this._surface);
                        restoreCr.setOperator(Cairo.Operator.SOURCE);
                        restoreCr.setSourceSurface(this._backupSurface, 0, 0);
                        restoreCr.paint();
                    }
                    this._polygonPoints = [];
                    this._drawing_area.queue_draw();
                    handled = true;
                }
                if (this._freeshapePoints && this._freeshapePoints.length > 0) {
                    if (this._surface && this._backupSurface) {
                        let restoreCr = new Cairo.Context(this._surface);
                        restoreCr.setOperator(Cairo.Operator.SOURCE);
                        restoreCr.setSourceSurface(this._backupSurface, 0, 0);
                        restoreCr.paint();
                    }
                    this._freeshapePoints = null;
                    this._drawing_area.queue_draw();
                    handled = true;
                }
                if (handled) return true;
            }

            return false;
        });
        this.add_controller(keyController);

        // Coordinate tracking motion controller
        const motionCtrl = new Gtk.EventControllerMotion();
        motionCtrl.connect('motion', (controller, x, y) => {
            const zX = x / this._zoomLevel;
            const zY = y / this._zoomLevel;
            if (zX >= 0 && zX <= this._canvasWidth && zY >= 0 && zY <= this._canvasHeight) {
                this._lbl_status_coords.set_label(`${Math.round(zX)}, ${Math.round(zY)} px`);
            } else {
                this._lbl_status_coords.set_label('-, - px');
            }

            // Update mouse cursor dynamically
            this._updateCursor(x, y);

            if (this._isDrawing) {

                this._motionCount++;
                if (this._motionCount % 30 === 0){
                  System.gc();
                }
                const isFreehandHighlight = this._tool_highlight.active && !this._opt_highlight_straighten;
                const isFreehand = this._tool_brush.active || this._tool_pencil.active || this._tool_eraser.active;
                
                if (isFreehandHighlight && !this._isResizingCanvas && !this._isMovingSelection && !this._isResizingSelection) {
                    if (this._isFirstDragUpdate) {
                        this._isFirstDragUpdate = false;
                    }
                    if (this._highlightPoints) {
                        this._highlightPoints.push({ x: zX, y: zY });
                        let cr = new Cairo.Context(this._surface);
                        cr.setOperator(Cairo.Operator.SOURCE);
                        cr.setSourceSurface(this._backupSurface, 0, 0);
                        cr.paint();
                        drawHighlightStroke(this, this._isSecondaryDrag);
                        cr = null;
                    }
                } else if (isFreehand && !this._isResizingCanvas && !this._isMovingSelection && !this._isResizingSelection) {
                    if (this._isFirstDragUpdate) {
                        this._lastX = zX;
                        this._lastY = zY;
                        this._isFirstDragUpdate = false;
                    }
                    this._drawStroke(zX, zY, true, this._isSecondaryDrag);
                    this._lastX = zX;
                    this._lastY = zY;
                }
            }
        });
        motionCtrl.connect('leave', () => {
            this._lbl_status_coords.set_label('-, - px');
            this._drawing_area.set_cursor_from_name('default');
        });
        this._drawing_area.add_controller(motionCtrl);

        // Right click gesture for context menu on selection
        const rightClickGesture = new Gtk.GestureClick();
        rightClickGesture.set_button(Gdk.BUTTON_SECONDARY);
        rightClickGesture.connect('pressed', (gesture, n_press, x, y) => {
            const zX = x / this._zoomLevel;
            const zY = y / this._zoomLevel;
            const isSelectionTool = this._tool_select_rect.active || this._tool_select_free.active;
            if (this._selectionActive && isSelectionTool &&
                zX >= this._selectionRect.x && zX <= this._selectionRect.x + this._selectionRect.w &&
                zY >= this._selectionRect.y && zY <= this._selectionRect.y + this._selectionRect.h) {

                this._showSelectionContextMenu(x, y);
                gesture.set_state(Gtk.EventSequenceState.CLAIMED);
            }
        });
        this._drawing_area.add_controller(rightClickGesture);

        // Track modified status
        this._isModified = false;

        // Load settings
        this._showLabelsSetting = true;
        this._centerCanvas = false;
        this._showStatusBar = true;
        this._savedCanvasWidth = 800;
        this._savedCanvasHeight = 600;
        this._savedPrimaryColor = 'black';
        this._savedSecondaryColor = 'white';

        this._loadSettings();

        // Apply settings
        this._chk_show_labels.active = this._showLabelsSetting;
        this._chk_center_canvas.active = this._centerCanvas;
        this._chk_status_bar.active = this._showStatusBar;
        this._chk_show_grid.active = this._showGrid;
        this._chk_pixel_view.active = this._pixelView;

        // Apply center canvas
        this._updateCanvasCentering();

        // Apply status bar visibility
        this._status_bar.set_visible(this._showStatusBar);
        this._updateStatusZoom();

        // Apply colors
        const rgbaP = new Gdk.RGBA();
        rgbaP.parse(this._savedPrimaryColor);
        this._color_button.set_rgba(rgbaP);

        const rgbaS = new Gdk.RGBA();
        rgbaS.parse(this._savedSecondaryColor);
        this._color_button_secondary.set_rgba(rgbaS);

        // Toggles & Actions connections
        this._chk_show_labels.connect('toggled', () => {
            this._showLabelsSetting = this._chk_show_labels.active;
            this._updateLabelsVisibility();
        });
        this._chk_center_canvas.connect('toggled', () => {
            this._centerCanvas = this._chk_center_canvas.active;
            this._updateCanvasCentering();
        });
        this._chk_status_bar.connect('toggled', () => {
            this._showStatusBar = this._chk_status_bar.active;
            this._status_bar.set_visible(this._showStatusBar);
        });
        this._chk_show_grid.connect('toggled', () => {
            this._showGrid = this._chk_show_grid.active;
            this._drawing_area.queue_draw();
        });
        this._chk_pixel_view.connect('toggled', () => {
            this._pixelView = this._chk_pixel_view.active;
            this._drawing_area.queue_draw();
        });

        this._menu_btn_new_window.connect('clicked', () => {
            this._newWindow();
            this._popover_primary.popdown();
        });

        this._btn_new_clipboard.connect('clicked', () => {
            this._confirmUnsaved(() => {
                this._newFromClipboard();
            });
            this._popover_new.popdown();
        });

        // Titlebar renaming connections
        this._btn_rename_apply.connect('clicked', () => {
            this._renameFile();
        });
        this._entry_rename.connect('activate', () => {
            this._renameFile();
        });
        this._btn_rename_open_folder.connect('clicked', () => {
            if (this._saveFilePath) {
                const file = Gio.File.new_for_path(this._saveFilePath);
                const parent = file.get_parent();
                if (parent) {
                    Gio.AppInfo.launch_default_for_uri(parent.get_uri(), null);
                }
            }
        });
        this._btn_rename_copy_path.connect('clicked', () => {
            if (this._saveFilePath) {
                this.get_clipboard().set(this._saveFilePath);
            }
        });
        this._popover_rename.connect('notify::visible', () => {
            if (this._popover_rename.visible) {
                this._updateRenamePopover();
            }
        });

        // Window close confirmation
        this.connect('close-request', () => {
            if (this._isModified) {
                this._confirmSaveAndClose();
                return true; // block close
            }
            this._saveSettings();
            return false; // allow close
        });

        this._updateLabelsVisibility();

        this.connect('realize', () => {
            this._updateDynamicCss();
        });
    }

    // Dynamically change toolbar icons
    _updateToolIcons() {
        // Selection
        if (this._tool_select_rect.active) {
            this._img_selection.set_from_icon_name('tool-select-rect-symbolic');
        } else if (this._tool_select_free.active) {
            this._img_selection.set_from_icon_name('tool-select-free-symbolic');
        }

        // Drawing
        if (this._tool_brush.active) {
            this._img_paint.set_from_icon_name('tool-brush-symbolic');
        } else if (this._tool_pencil.active) {
            this._img_paint.set_from_icon_name('tool-pencil-symbolic');
        } else if (this._tool_highlight.active) {
            this._img_paint.set_from_icon_name('tool-highlight-symbolic');
        } else if (this._tool_eraser.active) {
            this._img_paint.set_from_icon_name('tool-eraser-symbolic');
        } else if (this._tool_bucket.active) {
            this._img_paint.set_from_icon_name('tool-paint-symbolic');
        } else if (this._tool_picker.active) {
            this._img_paint.set_from_icon_name('color-select-symbolic');
        } else if (this._tool_text.active) {
            this._img_paint.set_from_icon_name('tool-text-symbolic');
        }

        // Shapes
        if (this._tool_line.active) {
            this._img_shapes.set_from_icon_name('tool-line-symbolic');
        } else if (this._tool_rect.active) {
            this._img_shapes.set_from_icon_name('tool-rectangle-symbolic');
        } else if (this._tool_oval.active) {
            this._img_shapes.set_from_icon_name('tool-oval-symbolic');
        } else if (this._tool_circle.active) {
            this._img_shapes.set_from_icon_name('tool-circle-symbolic');
        } else if (this._tool_polygon.active) {
            this._img_shapes.set_from_icon_name('tool-polygon-symbolic');
        } else if (this._tool_freeshape.active) {
            this._img_shapes.set_from_icon_name('tool-freeshape-symbolic');
        }
    }

    _updateThicknessIcon(value) {
        let sizeIcon = 'size-3-symbolic';
        if (value <= 2) {
            sizeIcon = 'size-1-symbolic';
        } else if (value <= 4) {
            sizeIcon = 'size-3-symbolic';
        } else if (value <= 6) {
            sizeIcon = 'size-5-symbolic';
        } else if (value <= 8) {
            sizeIcon = 'size-7-symbolic';
        } else if (value <= 15) {
            sizeIcon = 'size-8-symbolic';
        } else {
            sizeIcon = 'size-9-symbolic';
        }
        this._img_thickness.set_from_icon_name(sizeIcon);
    }

    // Canvas setup
    _setupDrawingArea() {
        this._drawing_area.set_draw_func((area, cr, width, height) => {
            cr.save();
            cr.scale(this._zoomLevel, this._zoomLevel);
            if (this._surface) {
                const cw = this._canvasWidth;
                const ch = this._canvasHeight;

                if (this._canvasBgColor === 'transparent') {
                    // Draw checkerboard background for transparent areas
                    cr.save();
                    cr.setSourceRGB(1.0, 1.0, 1.0);
                    cr.rectangle(0, 0, cw, ch);
                    cr.fill();
                    cr.setSourceRGB(0.93, 0.93, 0.93);
                    const checkerSize = 8;
                    for (let y = 0; y < ch; y += checkerSize) {
                        const startX = (Math.floor(y / checkerSize) % 2 === 0) ? 0 : checkerSize;
                        for (let x = startX; x < cw; x += checkerSize * 2) {
                            const rectW = Math.min(checkerSize, cw - x);
                            const rectH = Math.min(checkerSize, ch - y);
                            cr.rectangle(x, y, rectW, rectH);
                        }
                    }
                    cr.fill();
                    cr.restore();
                } else if (this._canvasBgColor && this._canvasBgColor !== 'transparent') {
                    cr.save();
                    cr.setSourceRGBA(this._canvasBgColor.red, this._canvasBgColor.green, this._canvasBgColor.blue, this._canvasBgColor.alpha);
                    cr.rectangle(0, 0, cw, ch);
                    cr.fill();
                    cr.restore();
                } else {
                    // Default opaque white background underneath
                    cr.save();
                    cr.setSourceRGB(1.0, 1.0, 1.0);
                    cr.rectangle(0, 0, cw, ch);
                    cr.fill();
                    cr.restore();
                }

                if (this._pixelView) {
                    const pattern = new Cairo.SurfacePattern(this._surface);
                    pattern.setFilter(Cairo.Filter.NEAREST);
                    cr.setSource(pattern);
                    pattern = null;
                } else {
                    cr.setSourceSurface(this._surface, 0, 0);
                }
                cr.paint();

                if (this._showGrid) {
                    const gridStep = this._pixelView ? 1 : (this._pref_grid_step || 10);
                    cr.save();
                    const gCol = this._pref_grid_color || { red: 0, green: 0, blue: 0, alpha: 0.12 };
                    cr.setSourceRGBA(gCol.red, gCol.green, gCol.blue, gCol.alpha);
                    cr.setLineWidth(1 / this._zoomLevel);
                    for (let gx = gridStep; gx < cw; gx += gridStep) {
                        cr.moveTo(gx, 0);
                        cr.lineTo(gx, ch);
                    }
                    for (let gy = gridStep; gy < ch; gy += gridStep) {
                        cr.moveTo(0, gy);
                        cr.lineTo(cw, gy);
                    }
                    cr.stroke();
                    cr.restore();
                }
            }

            // Draw floating selection over canvas
            if (this._selectionActive && this._selectionSurface) {
                const accent = this._getAccentColor();
                cr.save();
                cr.translate(this._selectionRect.x, this._selectionRect.y);
                const w = this._selectionSurface.getWidth();
                const h = this._selectionSurface.getHeight();
                cr.scale(this._selectionRect.w / w, this._selectionRect.h / h);

                let processed = this._getProcessedSelectionSurface();
                if (processed) {
                    cr.setSourceSurface(processed, 0, 0);
                    cr.paint();

                    if (processed !== this._selectionSurface && typeof processed.destroy === 'function') {
                        processed.destroy();
                    }
                }
                processed = null;
                cr.restore();

                // Dashed border
                cr.save();
                cr.setSourceRGB(accent.r, accent.g, accent.b);
                cr.setLineWidth(1 / this._zoomLevel);
                cr.setDash([4 / this._zoomLevel, 4 / this._zoomLevel], 0);
                cr.rectangle(this._selectionRect.x, this._selectionRect.y, this._selectionRect.w, this._selectionRect.h);
                cr.stroke();
                cr.restore();

                // Resize handles (8 points)
                cr.save();
                cr.setSourceRGB(accent.r, accent.g, accent.b);
                const hs = 6 / this._zoomLevel;
                const x = this._selectionRect.x;
                const y = this._selectionRect.y;
                const sw = this._selectionRect.w;
                const sh = this._selectionRect.h;

                const handles = [
                    { x: x, y: y },                 // 0: TL
                    { x: x + sw / 2, y: y },         // 1: TM
                    { x: x + sw, y: y },             // 2: TR
                    { x: x, y: y + sh / 2 },         // 3: ML
                    { x: x + sw, y: y + sh / 2 },     // 4: MR
                    { x: x, y: y + sh },             // 5: BL
                    { x: x + sw / 2, y: y + sh },     // 6: BM
                    { x: x + sw, y: y + sh }          // 7: BR
                ];

                for (const hn of handles) {
                    cr.rectangle(hn.x - hs / 2, hn.y - hs / 2, hs, hs);
                    cr.fill();
                    cr.save();
                    cr.setSourceRGB(1.0, 1.0, 1.0);
                    cr.setLineWidth(1 / this._zoomLevel);
                    cr.rectangle(hn.x - hs / 2, hn.y - hs / 2, hs, hs);
                    cr.stroke();
                    cr.restore();
                }
                cr.restore();
            }
            cr.restore();

            // Draw canvas resize handles in screen coordinates
            cr.save();
            const accent = this._getAccentColor();
            cr.setSourceRGB(accent.r, accent.g, accent.b);
            const hs_canvas = 8;
            const cw_screen = this._canvasWidth * this._zoomLevel;
            const ch_screen = this._canvasHeight * this._zoomLevel;

            const canvasHandles = [
                { x: cw_screen, y: ch_screen / 2 },
                { x: cw_screen / 2, y: ch_screen },
                { x: cw_screen, y: ch_screen }
            ];

            for (const h of canvasHandles) {
                cr.rectangle(h.x - hs_canvas / 2, h.y - hs_canvas / 2, hs_canvas, hs_canvas);
                cr.fill();
                cr.save();
                cr.setSourceRGB(1.0, 1.0, 1.0);
                cr.setLineWidth(1);
                cr.rectangle(h.x - hs_canvas / 2, h.y - hs_canvas / 2, hs_canvas, hs_canvas);
                cr.stroke();
                cr.restore();
            }

       if (this._isGradientActive) {
    let crTemp = new Cairo.Context(this._surface);
    crTemp.save();

    crTemp.setLineWidth(2 / this._zoomLevel);
    crTemp.setSourceRGBA(1, 1, 1, 1);
    crTemp.moveTo(this._gradientStartX, this._gradientStartY);
    crTemp.lineTo(this._gradientCurrentX, this._gradientCurrentY);
    crTemp.stroke();

    crTemp.arc(this._gradientCurrentX, this._gradientCurrentY, 4 / this._zoomLevel, 0, 2 * Math.PI);
    crTemp.fill();
    crTemp.restore();
}
            cr.restore();
            cr = null;
            return true;
        });

        this._drawing_area.connect('resize', (area, width, height) => {
            // Run initSurface only on startup
            if (!this._surface) {
                this._initSurface(width, height);
            }
        });
        this._drawing_area.set_focusable(true);
    }

    // Initialize Cairo surface with custom or white background
    _initSurface(width, height, bgColor = 'transparent') {

    if (this._undoStack) {
        this._undoStack.forEach(s => { if (s && typeof s.destroy === 'function') s.destroy(); });
    }
    if (this._redoStack) {
        this._redoStack.forEach(s => { if (s && typeof s.destroy === 'function') s.destroy(); });
    }
    if (this._surface && typeof this._surface.destroy === 'function') this._surface.destroy();
    if (this._backupSurface && typeof this._backupSurface.destroy === 'function') this._backupSurface.destroy();
        this._canvasWidth = width;
        this._canvasHeight = height;
        this._isModified = false;
        this._saveFilePath = null;
        this._saveGioFile = null;
        this._updateTitle();

        this._surface = new Cairo.ImageSurface(Cairo.Format.ARGB32, width, height);
        let cr = new Cairo.Context(this._surface);
        cr.setOperator(Cairo.Operator.SOURCE);
        if (bgColor === 'transparent') {
            this._canvasBgColor = 'transparent';
            cr.setSourceRGBA(0.0, 0.0, 0.0, 0.0);
        } else if (bgColor) {
            this._canvasBgColor = bgColor;
            cr.setSourceRGBA(bgColor.red, bgColor.green, bgColor.blue, bgColor.alpha);
        } else {
            const white = new Gdk.RGBA();
            white.parse('white');
            this._canvasBgColor = white;
            cr.setSourceRGB(1.0, 1.0, 1.0);
        }
        cr.paint();
        cr.setOperator(Cairo.Operator.OVER);

        // Prepare backup surface with same dimensions
        this._backupSurface = new Cairo.ImageSurface(Cairo.Format.ARGB32, width, height);

        // Clear undo/redo stack to avoid mismatch
        this._undoStack = [];
        this._redoStack = [];

        this._updateCanvasSizeRequest();
        this._drawing_area.queue_draw();
        this._updateStatusDims();
    }

    _updateCanvasSizeRequest() {
        if (this._canvasWidth && this._canvasHeight) {
            const w = this._canvasWidth * this._zoomLevel;
            const h = this._canvasHeight * this._zoomLevel;
            this._drawing_area.set_size_request(w + 16, h + 16);
        }
    }

    _zoom(factor) {
        this._zoomLevel = Math.max(0.1, Math.min(20.0, this._zoomLevel * factor));
        this._updateCanvasSizeRequest();
        this._drawing_area.queue_draw();
        this._updateStatusZoom();

        System.gc();
    }

    _setupZoomGesture() {
        // GestureZoom for smooth pinch-to-zoom
        const zoomGesture = new Gtk.GestureZoom();
        zoomGesture.set_propagation_phase(Gtk.PropagationPhase.CAPTURE);
        this._zoomGesture = zoomGesture;
        this._scrolled_window.add_controller(zoomGesture);

        zoomGesture.connect('begin', (gesture, sequence) => {
            this._zoomStartLevel = this._zoomLevel;
            if (sequence) {
                gesture.set_sequence_state(sequence, Gtk.EventSequenceState.CLAIMED);
            }
        });
        zoomGesture.connect('scale-changed', (gesture, scale) => {
            this._zoomLevel = this._zoomStartLevel * scale;
            if (this._zoomLevel < 0.1) this._zoomLevel = 0.1;
            if (this._zoomLevel > 20.0) this._zoomLevel = 20.0;
            this._updateCanvasSizeRequest();
            this._drawing_area.queue_draw();
            this._updateStatusZoom();

            this._zoomCount = (this._zoomCount || 0) + 1;
            if (this._zoomCount % 15 === 0){
              System.gc();
            }
        });
    }

    _clearCanvas() {
        if (!this._surface) return;
        let cr = new Cairo.Context(this._surface);
        cr.setOperator(Cairo.Operator.SOURCE);
        if (this._pref_clear_mode === 'primary') {
            const col = this._getCurrentColor(false);
            cr.setSourceRGBA(col.r, col.g, col.b, col.a);
        } else if (this._pref_clear_mode === 'secondary') {
            const col = this._getCurrentColor(true);
            cr.setSourceRGBA(col.r, col.g, col.b, col.a);
        } else if (this._pref_clear_mode === 'color') {
            if (this._pref_clear_color) {
                cr.setSourceRGBA(this._pref_clear_color.red, this._pref_clear_color.green, this._pref_clear_color.blue, this._pref_clear_color.alpha);
            } else {
                cr.setSourceRGBA(1.0, 1.0, 1.0, 1.0);
            }
        } else {
            // transparent
            cr.setSourceRGBA(0.0, 0.0, 0.0, 0.0);
        }
        cr.paint();
        cr.setOperator(Cairo.Operator.OVER);
        cr = null;
        this._drawing_area.queue_draw();
    }

    _saveToUndoStack() {
if (!this._surface) return;
        this._isModified = true;
        const width = this._surface.getWidth();
        const height = this._surface.getHeight();
        const copy = new Cairo.ImageSurface(Cairo.Format.ARGB32, width, height);
        const cr = new Cairo.Context(copy);
        cr.setSourceSurface(this._surface, 0, 0);
        cr.paint();

        this._undoStack.push(copy);

        // Clear redo
        this._redoStack = [];

        // Mantieni il limite della cronologia correggendo il leak
        if (this._undoStack.length > MAX_UNDO_STAGES) {
            let dropped = this._undoStack.shift();
            if (dropped && typeof dropped.destroy === 'function') {
                dropped.destroy();
            }
            dropped = null;
        }

        System.gc();
    }

    _undo() {
        this._bakeSelection();
        if (this._undoStack.length === 0) return;

        const width = this._surface.getWidth();
        const height = this._surface.getHeight();
        const currentCopy = new Cairo.ImageSurface(Cairo.Format.ARGB32, width, height);
        const crCopy = new Cairo.Context(currentCopy);
        crCopy.setSourceSurface(this._surface, 0, 0);
        crCopy.paint();

        this._redoStack.push(currentCopy);

        if (this._redoStack.length > MAX_UNDO_STAGES) {
            let droppedRedo = this._redoStack.shift();
            if (droppedRedo && typeof droppedRedo.destroy === 'function') droppedRedo.destroy();
            droppedRedo = null;
        }

        const previous = this._undoStack.pop();
        const prevW = previous.getWidth();
        const prevH = previous.getHeight();

        if (this._surface && typeof this._surface.destroy === 'function') this._surface.destroy();
        if (this._backupSurface && typeof this._backupSurface.destroy === 'function') this._backupSurface.destroy();


        this._surface = new Cairo.ImageSurface(Cairo.Format.ARGB32, prevW, prevH);
        let cr = new Cairo.Context(this._surface);
        cr.setSourceSurface(previous, 0, 0);
        cr.paint();
        cr = null;

        this._backupSurface = new Cairo.ImageSurface(Cairo.Format.ARGB32, prevW, prevH);
        let crBackup = new Cairo.Context(this._backupSurface);
        crBackup.setSourceSurface(this._surface, 0, 0);
        crBackup.paint();
        crBackup = null;

        this._canvasWidth = prevW;
        this._canvasHeight = prevH;

        this._updateCanvasSizeRequest();
        this._drawing_area.queue_draw();
        this._updateStatusDims();

        System.gc();
    }

    _redo() {
        this._bakeSelection();
        if (this._redoStack.length === 0) return;

        const width = this._surface.getWidth();
        const height = this._surface.getHeight();
        const currentCopy = new Cairo.ImageSurface(Cairo.Format.ARGB32, width, height);
        const crCopy = new Cairo.Context(currentCopy);
        crCopy.setSourceSurface(this._surface, 0, 0);
        crCopy.paint();

        this._undoStack.push(currentCopy);

        if (this._undoStack.length > MAX_UNDO_STAGES) {
            let droppedUndo = this._undoStack.shift();
            if (droppedUndo && typeof droppedUndo.destroy === 'function') droppedUndo.destroy();
            droppedUndo = null;
        }

        const next = this._redoStack.pop();
        const nextW = next.getWidth();
        const nextH = next.getHeight();

        if (this._surface && typeof this._surface.destroy === 'function') this._surface.destroy();
        if (this._backupSurface && typeof this._backupSurface.destroy === 'function') this._backupSurface.destroy();

        this._surface = new Cairo.ImageSurface(Cairo.Format.ARGB32, nextW, nextH);
        let cr = new Cairo.Context(this._surface);
        cr.setSourceSurface(next, 0, 0);
        cr.paint();
        cr = null;

        this._backupSurface = new Cairo.ImageSurface(Cairo.Format.ARGB32, nextW, nextH);
        let crBackup = new Cairo.Context(this._backupSurface);
        crBackup.setSourceSurface(this._surface, 0, 0);
        crBackup.paint();
        crBackup = null;

        this._canvasWidth = nextW;
        this._canvasHeight = nextH;

        this._updateCanvasSizeRequest();
        this._drawing_area.queue_draw();
        this._updateStatusDims();

        System.gc();
    }

    _toggleToolbarPosition() {
        this._main_layout.remove(this._toolbar_box);
        if (this._toolbarAtTop) {
            this._main_layout.insert_child_after(this._toolbar_box, this._scrolled_window);
            this._btn_toggle_position.set_icon_name('go-up-symbolic');
            this._toolbarAtTop = false;
        } else {
            this._main_layout.prepend(this._toolbar_box);
            this._btn_toggle_position.set_icon_name('go-down-symbolic');
            this._toolbarAtTop = true;
        }
    }

    // Bake floating selection into the canvas
    _bakeSelection() {
        if (this._activeTextEditor) {
            this._bakeTextEditor();
        }
        if (!this._selectionActive || !this._selectionSurface) return;

        let cr = new Cairo.Context(this._surface);
        cr.save();
        cr.translate(this._selectionRect.x, this._selectionRect.y);
        const w = this._selectionSurface.getWidth();
        const h = this._selectionSurface.getHeight();
        cr.scale(this._selectionRect.w / w, this._selectionRect.h / h);

        const processed = this._getProcessedSelectionSurface();
        if (processed) {
            cr.setSourceSurface(processed, 0, 0);
            cr.paint();

            if (processed !== this._selectionSurface && typeof processed.destroy === 'function') {
                processed.destroy();
            }
        }
        cr.restore();

if (this._selectionSurface && typeof this._selectionSurface.destroy === 'function') {
            this._selectionSurface.destroy();
        }
        this._selectionSurface = null;
        this._selectionActive = false;
        this._updateTransformButtonsSensitivity();
        this._drawing_area.queue_draw();
    }

    _getProcessedSelectionSurface() {
        if (!this._selectionSurface) return null;
        if (this._opt_select_mode === 'standard') {
            return this._selectionSurface;
        }

        const w = this._selectionSurface.getWidth();
        const h = this._selectionSurface.getHeight();

        let pixbuf = Gdk.pixbuf_get_from_surface(this._selectionSurface, 0, 0, w, h);
        if (!pixbuf) return this._selectionSurface;

        if (!pixbuf.get_has_alpha()) {
            pixbuf = pixbuf.add_alpha(false, 0, 0, 0);
        }

        const data = pixbuf.get_pixels();
        const nChannels = pixbuf.get_n_channels();
        const rowstride = pixbuf.get_rowstride();

        if (this._opt_select_mode === 'transparent') {
            const bg = this._getCurrentColor(true);
            const bgR = Math.round(bg.r * 255);
            const bgG = Math.round(bg.g * 255);
            const bgB = Math.round(bg.b * 255);

            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    const idx = y * rowstride + x * nChannels;
                    const r = data[idx];
                    const g = data[idx + 1];
                    const b = data[idx + 2];

                    const threshold = 15;
                    if (Math.abs(r - bgR) < threshold && Math.abs(g - bgG) < threshold && Math.abs(b - bgB) < threshold) {
                        data[idx + 3] = 0; // Alpha
                    }
                }
            }
        } else if (this._opt_select_mode === 'invert') {
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    const idx = y * rowstride + x * nChannels;
                    data[idx] = 255 - data[idx];         // Red
                    data[idx + 1] = 255 - data[idx + 1]; // Green
                    data[idx + 2] = 255 - data[idx + 2]; // Blue
                }
            }
        }

        const processed = new Cairo.ImageSurface(Cairo.Format.ARGB32, w, h);
        const cr = new Cairo.Context(processed);
        const bytes = GLib.Bytes.new(data);
        const newPixbuf = GdkPixbuf.Pixbuf.new_from_bytes(
            bytes,
            GdkPixbuf.Colorspace.RGB,
            true,
            8,
            w,
            h,
            rowstride
        );
        Gdk.cairo_set_source_pixbuf(cr, newPixbuf, 0, 0);
        cr.paint();

        cr = null; bytes = null; newPixbuf = null; pixbuf = null;

        return processed;
    }

    _getSelectionHit(mx, my) {
        if (!this._selectionActive) return -1;
        const x = this._selectionRect.x;
        const y = this._selectionRect.y;
        const w = this._selectionRect.w;
        const h = this._selectionRect.h;
        const hs = 8 / this._zoomLevel;

        const handles = [
            { x: x, y: y },                 // 0: TL
            { x: x + w / 2, y: y },         // 1: TM
            { x: x + w, y: y },             // 2: TR
            { x: x, y: y + h / 2 },         // 3: ML
            { x: x + w, y: y + h / 2 },     // 4: MR
            { x: x, y: y + h },             // 5: BL
            { x: x + w / 2, y: y + h },     // 6: BM
            { x: x + w, y: y + h }          // 7: BR
        ];

        for (let i = 0; i < 8; i++) {
            if (mx >= handles[i].x - hs && mx <= handles[i].x + hs &&
                my >= handles[i].y - hs && my <= handles[i].y + hs) {
                return i;
            }
        }

        if (mx >= x && mx <= x + w && my >= y && my <= y + h) {
            return 8;
        }

        return -1;
    }

    _handleResizeDrag(currentX, currentY) {
        const rect = this._selectionRect;
        const start = this._selectionStartRect;
        const dx = currentX - this._startX;
        const dy = currentY - this._startY;

        switch (this._resizeHandleIndex) {
            case 0: // TL
                rect.x = start.x + dx;
                rect.y = start.y + dy;
                rect.w = start.w - dx;
                rect.h = start.h - dy;
                break;
            case 1: // TM
                rect.y = start.y + dy;
                rect.h = start.h - dy;
                break;
            case 2: // TR
                rect.y = start.y + dy;
                rect.w = start.w + dx;
                rect.h = start.h - dy;
                break;
            case 3: // ML
                rect.x = start.x + dx;
                rect.w = start.w - dx;
                break;
            case 4: // MR
                rect.w = start.w + dx;
                break;
            case 5: // BL
                rect.x = start.x + dx;
                rect.w = start.w - dx;
                rect.h = start.h + dy;
                break;
            case 6: // BM
                rect.h = start.h + dy;
                break;
            case 7: // BR
                rect.w = start.w + dx;
                rect.h = start.h + dy;
                break;
        }

        if (rect.w < 2) rect.w = 2;
        if (rect.h < 2) rect.h = 2;
    }

    _copySelection() {
        if (!this._selectionActive || !this._selectionSurface) return;

        const targetW = Math.round(this._selectionRect.w);
        const targetH = Math.round(this._selectionRect.h);

        if (this._clipboardSurface && typeof this._clipboardSurface.destroy === 'function') {
            this._clipboardSurface.destroy();
        }

        this._clipboardSurface = new Cairo.ImageSurface(Cairo.Format.ARGB32, targetW, targetH);
        let cr = new Cairo.Context(this._clipboardSurface);

        const origW = this._selectionSurface.getWidth();
        const origH = this._selectionSurface.getHeight();
        cr.scale(targetW / origW, targetH / origH);

        const processed = this._getProcessedSelectionSurface();
        if (processed) {
            cr.setSourceSurface(processed, 0, 0);
            cr.paint();

            if (processed !== this._selectionSurface && typeof processed.destroy === 'function') {
                processed.destroy();
            }
        }
        cr = null;

        try {
            const clipboard = this.get_clipboard();
            const pixbuf = Gdk.pixbuf_get_from_surface(this._clipboardSurface, 0, 0, targetW, targetH);
            if (pixbuf) {
                clipboard.set(Gdk.Texture.new_for_pixbuf(pixbuf));
                clipboard.store_async(GLib.PRIORITY_DEFAULT, null, (obj, res) => {
                    try {
                        obj.store_finish(res);
                    } catch (e) {
                        console.warn("Clipboard storage persistence not supported by environment:", e.message);
                    }
                });
            }
        } catch (err) {
            console.error("Error setting system clipboard texture:", err);
        }
    }

    _cutSelection() {
        this._copySelection();
        this._deleteSelection();
    }

    _deleteSelection() {
        if (!this._selectionActive) return;
        this._saveToUndoStack();
        this._selectionSurface = null;
        this._selectionActive = false;
        this._updateTransformButtonsSensitivity();
        this._drawing_area.queue_draw();
    }

    _pasteSelection() {
        const clipboard = this.get_clipboard();
        clipboard.read_texture_async(null, (source, result) => {
            let texture = null;
            try {
                texture = source.read_texture_finish(result);
            } catch (err) {
                console.warn("Failed to read texture from system clipboard, falling back to local:", err);
            }

            try {
                if (texture) {
                    const w = texture.get_width();
                    const h = texture.get_height();

                    this._bakeSelection();
                    this._saveToUndoStack();

                    this._selectionSurface = new Cairo.ImageSurface(Cairo.Format.ARGB32, w, h);
                    const cr = new Cairo.Context(this._selectionSurface);
                    const pixbuf = Gdk.pixbuf_get_from_texture(texture);
                    if (pixbuf) {
                        Gdk.cairo_set_source_pixbuf(cr, pixbuf, 0, 0);
                        cr.paint();
                    }

                    this._selectionRect = { x: 20, y: 20, w: w, h: h };
                    this._selectionActive = true;
                    this._updateTransformButtonsSensitivity();
                    this._drawing_area.queue_draw();
                } else {
                    if (this._clipboardSurface) {
                        this._bakeSelection();
                        this._saveToUndoStack();

                        const w = this._clipboardSurface.getWidth();
                        const h = this._clipboardSurface.getHeight();

                        this._selectionSurface = new Cairo.ImageSurface(Cairo.Format.ARGB32, w, h);
                        const cr = new Cairo.Context(this._selectionSurface);
                        cr.setSourceSurface(this._clipboardSurface, 0, 0);
                        cr.paint();

                        this._selectionRect = { x: 20, y: 20, w: w, h: h };
                        this._selectionActive = true;
                        this._updateTransformButtonsSensitivity();
                        this._drawing_area.queue_draw();
                    }
                }
            } catch (err) {
                console.error("Error applying pasted content:", err);
            }
        });
    }

    // Handle mouse input
    _setupDragGesture() {
        const dragPrimary = new Gtk.GestureDrag();
        dragPrimary.set_button(Gdk.BUTTON_PRIMARY);
        this._setupDragSignals(dragPrimary, false);
        this._drawing_area.add_controller(dragPrimary);
        this._dragPrimary = dragPrimary;

        const dragSecondary = new Gtk.GestureDrag();
        dragSecondary.set_button(Gdk.BUTTON_SECONDARY);
        this._setupDragSignals(dragSecondary, true);
        this._drawing_area.add_controller(dragSecondary);
        this._dragSecondary = dragSecondary;
    }

    _setupDragSignals(drag, isSecondary) {
        drag.connect('drag-begin', (gesture, startX, startY) => {
            // Check canvas resize handles first!
            const canvasResizeHit = this._getCanvasResizeHit(startX, startY);
            if (canvasResizeHit) {
                this._isResizingCanvas = true;
                this._canvasResizeHandle = canvasResizeHit;
                this._canvasStartWidth = this._canvasWidth;
                this._canvasStartHeight = this._canvasHeight;
                this._saveToUndoStack();
                return;
            }

            const zX = startX / this._zoomLevel;
            const zY = startY / this._zoomLevel;

            this._startX = zX;
            this._startY = zY;
            this._lastX = zX;
            this._lastY = zY;
            this._isFirstDragUpdate = false;
            this._isDrawing = true;
            this._isSecondaryDrag = isSecondary;

            this._drawing_area.grab_focus();

            this._popover_options.popdown();
            this._popover_selection.popdown();
            this._popover_paint.popdown();
            this._popover_shapes.popdown();
            this._popover_thickness.popdown();
            this._btn_options.popdown();
            if (this._tool_polygon.active) {
                if (!this._polygonPoints) {
                    this._polygonPoints = [];
                }
                if (this._polygonPoints.length > 0) {
                    const dx = zX - this._polygonPoints[0].x;
                    const dy = zY - this._polygonPoints[0].y;
                    const dist = Math.sqrt(dx*dx + dy*dy);
                    if (dist < 15 / this._zoomLevel) {
                        this._bakePolygon(isSecondary);
                        return;
                    }
                }
                if (this._polygonPoints.length === 0) {
                    this._saveToUndoStack();
                    let cr = new Cairo.Context(this._backupSurface);
                    cr.setOperator(Cairo.Operator.SOURCE);
                    cr.setSourceSurface(this._surface, 0, 0);
                    cr.paint();
                    cr = null;
                }
                this._polygonPoints.push({ x: zX, y: zY });
                return;
            }
            if (this._tool_freeshape.active) {
                this._saveToUndoStack();
                this._freeshapePoints = [{ x: zX, y: zY }];
                let cr = new Cairo.Context(this._backupSurface);
                cr.setOperator(Cairo.Operator.SOURCE);
                cr.setSourceSurface(this._surface, 0, 0);
                cr.paint();
                cr = null;
                return;
            }

            if (this._tool_text.active) {
                if (this._activeTextEditor) {
                    const editorX = this._activeTextEditor.get_margin_start();
                    const editorY = this._activeTextEditor.get_margin_top();
                    const w = this._activeTextEditor.get_width();
                    const h = this._activeTextEditor.get_height();
                    if (startX >= editorX && startX <= editorX + w && startY >= editorY && startY <= editorY + h) {
                        return; // Let GtkTextView receive event
                    } else {
                        this._bakeTextEditor();
                    }
                }

                this._saveToUndoStack();
                this._isDraggingTextRect = true;
                let cr = new Cairo.Context(this._backupSurface);
                cr.setOperator(Cairo.Operator.SOURCE);
                cr.setSourceSurface(this._surface, 0, 0);
                cr.paint();
                cr = null;
                return;
            }

            this._pickerToolActiveOnDragStart = this._tool_picker.active;
            if (this._tool_picker.active) {
                this._pickColor(zX, zY, isSecondary);
                this._isDrawing = false;
                return;
            }


           if (this._tool_bucket.active) {
                if (this._opt_fill_mode === 'gradiente') {
                    this._isGradientActive = true;
                    this._gradientStartX = zX;
                    this._gradientStartY = zY;
                    this._gradientCurrentX = zX;
                    this._gradientCurrentY = zY;

                    let cr = new Cairo.Context(this._backupSurface);
        cr.setOperator(Cairo.Operator.SOURCE);
        cr.setSourceSurface(this._surface, 0, 0);
        cr.paint();
        cr = null;
                } else {
                    floodFill(this, zX, zY, isSecondary);
                }
                return;
            }


            const isSelectionTool = this._tool_select_rect.active || this._tool_select_free.active;
            if (isSelectionTool) {
                const hit = this._getSelectionHit(zX, zY);
                if (hit >= 0) {
                    this._selectionStartRect = { ...this._selectionRect };
                    if (hit === 8) {
                        this._isMovingSelection = true;
                        this._isResizingSelection = false;
                    } else {
                        this._isMovingSelection = false;
                        this._isResizingSelection = true;
                        this._resizeHandleIndex = hit;
                    }
                    this._saveToUndoStack();
                    return;
                } else {
                    // Click outside: bake previous selection and start new one
                    this._bakeSelection();
                    this._isMovingSelection = false;
                    this._isResizingSelection = false;

                    let cr = new Cairo.Context(this._backupSurface);
                    cr.setOperator(Cairo.Operator.SOURCE);
                    cr.setSourceSurface(this._surface, 0, 0);
                    cr.paint();

                    if (this._tool_select_free.active) {
                        this._freeSelectionPoints = [{ x: zX, y: zY }];
                    }
                }
            } else {
                this._bakeSelection();
                this._saveToUndoStack();

                const isShape = this._tool_line.active || this._tool_rect.active || this._tool_oval.active || this._tool_circle.active || (this._tool_highlight.active && this._opt_highlight_straighten);
                const isFreehandHighlight = this._tool_highlight.active && !this._opt_highlight_straighten;
                if (isShape || isFreehandHighlight) {
                    let cr = new Cairo.Context(this._backupSurface);
                    cr.setOperator(Cairo.Operator.SOURCE);
                    cr.setSourceSurface(this._surface, 0, 0);
                    cr.paint();
                    cr = null;
                }

                if (isFreehandHighlight) {
                    this._highlightPoints = [{ x: zX, y: zY }];
                } else if (this._tool_brush.active || this._tool_pencil.active || this._tool_eraser.active) {
                    this._drawStroke(zX, zY, false, isSecondary);
                }
            }
        });

        drag.connect('drag-update', (gesture, offsetX, offsetY) => {
            if (this._isResizingCanvas) {
                const dx = offsetX / this._zoomLevel;
                const dy = offsetY / this._zoomLevel;
                let newW = this._canvasStartWidth;
                let newH = this._canvasStartHeight;
                if (this._canvasResizeHandle === 'right' || this._canvasResizeHandle === 'corner') {
                    newW = Math.max(10, Math.round(this._canvasStartWidth + dx));
                }
                if (this._canvasResizeHandle === 'bottom' || this._canvasResizeHandle === 'corner') {
                    newH = Math.max(10, Math.round(this._canvasStartHeight + dy));
                }
                this._resizeCanvasSurface(newW, newH);
                return;
            }

            if (this._pickerToolActiveOnDragStart) return;
            if (this._tool_picker.active || (this._tool_bucket.active && !this._isGradientActive)) return;

            this._motionCount++;
            if (this._motionCount % 30 === 0) {
                System.gc();
            }

            const zOffsetX = offsetX / this._zoomLevel;
            const zOffsetY = offsetY / this._zoomLevel;
            const currentX = this._startX + zOffsetX;
            const currentY = this._startY + zOffsetY;

            if (this._isFirstDragUpdate) {
                this._lastX = currentX;
                this._lastY = currentY;
                this._isFirstDragUpdate = false;
            }

            if (this._tool_polygon.active && this._polygonPoints && this._polygonPoints.length > 0) {
                let cr = new Cairo.Context(this._surface);
                cr.setOperator(Cairo.Operator.SOURCE);
                cr.setSourceSurface(this._backupSurface, 0, 0);
                cr.paint();
                this._drawPolygonPreview(currentX, currentY, isSecondary);
                cr = null;
                return;
            }
            if (this._tool_freeshape.active && this._freeshapePoints) {
                this._freeshapePoints.push({ x: currentX, y: currentY });
                let cr = new Cairo.Context(this._surface);
                cr.setOperator(Cairo.Operator.SOURCE);
                cr.setSourceSurface(this._backupSurface, 0, 0);
                cr.paint();
                this._drawFreeshapePreview(isSecondary);
                cr = null;
                return;
            }

            if (this._tool_bucket.active && this._isGradientActive) {
    this._gradientCurrentX = currentX;
    this._gradientCurrentY = currentY;

    if (this._surface && this._backupSurface) {
        let crRestore = new Cairo.Context(this._surface);
        crRestore.setOperator(Cairo.Operator.SOURCE);
        crRestore.setSourceSurface(this._backupSurface, 0, 0);
        crRestore.paint();
        crRestore = null;
    }
    this._drawing_area.queue_draw();
    return;
}


            const isSelectionTool = this._tool_select_rect.active || this._tool_select_free.active;
            if (isSelectionTool) {
                if (this._isMovingSelection) {
                    this._selectionRect.x = this._selectionStartRect.x + zOffsetX;
                    this._selectionRect.y = this._selectionStartRect.y + zOffsetY;
                    this._drawing_area.queue_draw();
                } else if (this._isResizingSelection) {
                    this._handleResizeDrag(currentX, currentY);
                    this._drawing_area.queue_draw();
                } else {
                    // Create new selection
                    let cr = new Cairo.Context(this._surface);
                    cr.setOperator(Cairo.Operator.SOURCE);
                    cr.setSourceSurface(this._backupSurface, 0, 0);
                    cr.paint();
                  if (this._tool_select_free.active && this._freeSelectionPoints) {
                        this._freeSelectionPoints.push({ x: currentX, y: currentY });
                        drawFreeSelectionPreview(this);
                    } else {
                        this._drawShapePreview(this._startX, this._startY, currentX, currentY, isSecondary);
                    }
                }
                return;
            }

            const isShape = this._tool_line.active || this._tool_rect.active || this._tool_oval.active || this._tool_circle.active || (this._tool_highlight.active && this._opt_highlight_straighten);
            if (isShape) {
                let cr = new Cairo.Context(this._surface);
                cr.setOperator(Cairo.Operator.SOURCE);
                cr.setSourceSurface(this._backupSurface, 0, 0);
                cr.paint();
                this._drawShapePreview(this._startX, this._startY, currentX, currentY, isSecondary);
                cr = null;
            } else if (this._tool_text.active && this._isDraggingTextRect) {
                let cr = new Cairo.Context(this._surface);
                cr.setOperator(Cairo.Operator.SOURCE);
                cr.setSourceSurface(this._backupSurface, 0, 0);
                cr.paint();
                const accent = this._getAccentColor();
                cr.setSourceRGB(accent.r, accent.g, accent.b);
                cr.setLineWidth(1 / this._zoomLevel);
                cr.setDash([4 / this._zoomLevel, 4 / this._zoomLevel], 0);
                const x = Math.min(this._startX, currentX);
                const y = Math.min(this._startY, currentY);
                const w = Math.abs(this._startX - currentX);
                const h = Math.abs(this._startY - currentY);
                cr.rectangle(x, y, w, h);
                cr.stroke();
            } else if (this._tool_text.active) {
                // do nothing on drag update
            } else {
                // Freehand drawing is handled by the motion controller for maximum smoothness
            }
        });

        drag.connect('drag-end', (gesture, offsetX, offsetY) => {
            this._isDrawing = false;
            this._motionCount = 0;
            if (this._pickerToolActiveOnDragStart) {
                this._pickerToolActiveOnDragStart = false;
                return;
            }
            if (this._isResizingCanvas) {
                this._isResizingCanvas = false;
                this._canvasResizeHandle = null;
                return;
            }

        if (this._isGradientActive) {
    this._isGradientActive = false;

    if (this._surface && this._backupSurface) {
        let crRestore = new Cairo.Context(this._surface);
        crRestore.setOperator(Cairo.Operator.SOURCE);
        crRestore.setSourceSurface(this._backupSurface, 0, 0);
        crRestore.paint();
        crRestore = null;
    }

    const zOffsetX = offsetX / this._zoomLevel;
    const zOffsetY = offsetY / this._zoomLevel;
    const endX = this._gradientStartX + zOffsetX;
    const endY = this._gradientStartY + zOffsetY;

    applyGradientFill(this, this._gradientStartX, this._gradientStartY, endX, endY, isSecondary);
    return;
}

            if (this._tool_polygon.active) {
                const zOffsetX = offsetX / this._zoomLevel;
                const zOffsetY = offsetY / this._zoomLevel;
                const currentX = this._startX + zOffsetX;
                const currentY = this._startY + zOffsetY;
                if (this._polygonPoints && this._polygonPoints.length > 0) {
                    const lastPoint = this._polygonPoints[this._polygonPoints.length - 1];
                    const dx = currentX - lastPoint.x;
                    const dy = currentY - lastPoint.y;
                    const dist = Math.sqrt(dx*dx + dy*dy);
                    if (dist > 3) {
                        this._polygonPoints.push({ x: currentX, y: currentY });
                    }
                    this._drawing_area.queue_draw();
                }
                return;
            }
            if (this._tool_freeshape.active) {
                if (this._freeshapePoints && this._freeshapePoints.length > 1) {
                    let crRestore = new Cairo.Context(this._surface);
        crRestore.setOperator(Cairo.Operator.SOURCE);
        crRestore.setSourceSurface(this._backupSurface, 0, 0);
        crRestore.paint();
        crRestore = null;

        let crRender = new Cairo.Context(this._surface);
        this._drawFreeshape(crRender, isSecondary);
        crRender = null;

        this._freeshapePoints = null;
        this._drawing_area.queue_draw();
                }
                return;
            }

            if (this._tool_highlight.active && !this._opt_highlight_straighten) {
                if (this._highlightPoints && this._highlightPoints.length > 0) {
                    let crRestore = new Cairo.Context(this._surface);
                    crRestore.setOperator(Cairo.Operator.SOURCE);
                    crRestore.setSourceSurface(this._backupSurface, 0, 0);
                    crRestore.paint();
                    crRestore = null;

                    drawHighlightStroke(this, isSecondary);

                    this._highlightPoints = null;
                    this._drawing_area.queue_draw();
                }
                return;
            }

            if (this._tool_text.active && this._isDraggingTextRect) {
                this._isDraggingTextRect = false;
                const zOffsetX = offsetX / this._zoomLevel;
                const zOffsetY = offsetY / this._zoomLevel;
                const currentX = this._startX + zOffsetX;
                const currentY = this._startY + zOffsetY;

                let crRestore = new Cairo.Context(this._surface);
                crRestore.setOperator(Cairo.Operator.SOURCE);
                crRestore.setSourceSurface(this._backupSurface, 0, 0);
                crRestore.paint();
                crRestore = null;

                const x = Math.min(this._startX, currentX);
                const y = Math.min(this._startY, currentY);
                let w = Math.abs(this._startX - currentX);
                let h = Math.abs(this._startY - currentY);
                if (w < 20) w = 200;
                if (h < 20) h = 80;

                this._createTextEditor(x, y, w, h);
                return;
            }

            const isSelectionTool = this._tool_select_rect.active || this._tool_select_free.active;
            if (isSelectionTool) {
                if (this._isMovingSelection || this._isResizingSelection) {
                    this._isMovingSelection = false;
                    this._isResizingSelection = false;
                } else {
                    let crRestore = new Cairo.Context(this._surface);
                    crRestore.setOperator(Cairo.Operator.SOURCE);
                    crRestore.setSourceSurface(this._backupSurface, 0, 0);
                    crRestore.paint();
                    crRestore = null;

                    let x, y, w, h;

                    if (this._tool_select_free.active && this._freeSelectionPoints && this._freeSelectionPoints.length > 2) {
                        const xs = this._freeSelectionPoints.map(p => p.x);
                        const ys = this._freeSelectionPoints.map(p => p.y);
                        x = Math.floor(Math.min(...xs));
                        y = Math.floor(Math.min(...ys));
                        w = Math.ceil(Math.max(...xs) - x);
                        h = Math.ceil(Math.max(...ys) - y);
                    } else {
                        const zOffsetX = offsetX / this._zoomLevel;
                        const zOffsetY = offsetY / this._zoomLevel;
                        const currentX = this._startX + zOffsetX;
                        const currentY = this._startY + zOffsetY;
                        x = Math.floor(Math.min(this._startX, currentX));
                        y = Math.floor(Math.min(this._startY, currentY));
                        w = Math.ceil(Math.abs(this._startX - currentX));
                        h = Math.ceil(Math.abs(this._startY - currentY));
                    }

                    if (w > 4 && h > 4) {
                        this._saveToUndoStack();
                        this._selectionRect = { x: x, y: y, w: w, h: h };
                        this._selectionSurface = new Cairo.ImageSurface(Cairo.Format.ARGB32, w, h);

                        let crSel = new Cairo.Context(this._selectionSurface);

                        if (this._tool_select_free.active && this._freeSelectionPoints) {
                            crSel.moveTo(this._freeSelectionPoints[0].x - x, this._freeSelectionPoints[0].y - y);
                            for (let i = 1; i < this._freeSelectionPoints.length; i++) {
                                crSel.lineTo(this._freeSelectionPoints[i].x - x, this._freeSelectionPoints[i].y - y);
                            }
                            crSel.closePath();
                            crSel.clip();
                        }

                        crSel.setSourceSurface(this._surface, -x, -y);
                        crSel.paint();
                        crSel = null;

                        let crMain = new Cairo.Context(this._surface);
                        if (this._tool_select_free.active && this._freeSelectionPoints) {
                            crMain.moveTo(this._freeSelectionPoints[0].x, this._freeSelectionPoints[0].y);
                            for (let i = 1; i < this._freeSelectionPoints.length; i++) {
                                crMain.lineTo(this._freeSelectionPoints[i].x, this._freeSelectionPoints[i].y);
                            }
                            crMain.closePath();
                        } else {
                            crMain.rectangle(x, y, w, h);
                        }

                        crMain.setOperator(Cairo.Operator.SOURCE);
                        if (this._canvasBgColor === 'transparent') {
                            crMain.setSourceRGBA(0.0, 0.0, 0.0, 0.0);
                        } else if (this._canvasBgColor) {
                            crMain.setSourceRGBA(this._canvasBgColor.red, this._canvasBgColor.green, this._canvasBgColor.blue, this._canvasBgColor.alpha);
                        } else {
                            crMain.setSourceRGB(1.0, 1.0, 1.0);
                        }

                        if (this._tool_select_free.active && this._freeSelectionPoints) crMain.fill();
                        else crMain.fill();

                        crMain.setOperator(Cairo.Operator.OVER);
                        crMain = null;

                        this._selectionActive = true;
                        this._updateTransformButtonsSensitivity();
                    }
                    this._freeSelectionPoints = null;
                    this._drawing_area.queue_draw();
                }
            }
        });
    }

    // Get current selected color
    _getCurrentColor(isSecondary) {
        const widget = isSecondary ? this._color_button_secondary : this._color_button;
        const gdkColor = widget.get_rgba();
        return {
            r: gdkColor.red,
            g: gdkColor.green,
            b: gdkColor.blue,
            a: gdkColor.alpha
        };
    }

    // Freehand drawing
    _drawStroke(x, y, isMoving, isSecondary) {
        drawStroke(this, x, y, isMoving, isSecondary);
    }

    _drawRoundedRectangle(cr, x, y, w, h, radius) {
        drawRoundedRectangle(cr, x, y, w, h, radius);
    }

    // Shape drawing and previews
    _drawShapePreview(startX, startY, endX, endY, isSecondary) {
        drawShapePreview(this, startX, startY, endX, endY, isSecondary);
    }

    _drawPolygonPreview(currentX, currentY, isSecondary) {
        drawPolygonPreview(this, currentX, currentY, isSecondary);
    }

    _bakePolygon(isSecondary) {
        if (!this._polygonPoints || this._polygonPoints.length < 2) {
            if (this._surface && this._backupSurface) {
                let restoreCr = new Cairo.Context(this._surface);
                restoreCr.setOperator(Cairo.Operator.SOURCE);
                restoreCr.setSourceSurface(this._backupSurface, 0, 0);
                restoreCr.paint();
            }
            this._polygonPoints = [];
            this._drawing_area.queue_draw();
            return;
        }


        if (this._surface && this._backupSurface) {
            let restoreCr = new Cairo.Context(this._surface);
            restoreCr.setOperator(Cairo.Operator.SOURCE);
            restoreCr.setSourceSurface(this._backupSurface, 0, 0);
            restoreCr.paint();
        }

        let cr = new Cairo.Context(this._surface);
        cr.setAntialias(Cairo.Antialias.DEFAULT);
        cr.setLineCap(Cairo.LineCap.ROUND);
        cr.setLineJoin(Cairo.LineJoin.ROUND);
        const col = this._getCurrentColor(isSecondary);
        cr.moveTo(this._polygonPoints[0].x, this._polygonPoints[0].y);
        for (let i = 1; i < this._polygonPoints.length; i++) {
            cr.lineTo(this._polygonPoints[i].x, this._polygonPoints[i].y);
        }
        cr.closePath();

        if (this._opt_shapes_fill === 'primary') {
            const colPrim = this._getCurrentColor(false);
            cr.setSourceRGBA(colPrim.r, colPrim.g, colPrim.b, colPrim.a);
            cr.fillPreserve();
        } else if (this._opt_shapes_fill === 'secondary') {
            const colSec = this._getCurrentColor(true);
            cr.setSourceRGBA(colSec.r, colSec.g, colSec.b, colSec.a);
            cr.fillPreserve();
        }

        if (this._opt_shapes_outline) {
           if (this._opt_shapes_outline_color === 'primary') {
                const colPrim = this._getCurrentColor(false);
                cr.setSourceRGBA(colPrim.r, colPrim.g, colPrim.b, colPrim.a);
            } else {
                const colSec = this._getCurrentColor(true);
                cr.setSourceRGBA(colSec.r, colSec.g, colSec.b, colSec.a);
            }
            const outlineSize = this._opt_shapes_outline_thickness || 2;
            cr.setLineWidth(outlineSize);
            cr.stroke();
        } else {
            cr.newPath();
        }

        this._polygonPoints = [];
        this._drawing_area.queue_draw();
    }

    _drawFreeshapePreview(isSecondary) {
        drawFreeshapePreview(this, isSecondary);
    }

    _drawFreeshape(cr, isSecondary) {
        drawFreeshape(this, cr, isSecondary);
    }

    _selectAll() {
        this._bakeSelection();
        if (!this._surface) return;
        this._saveToUndoStack();

        const w = this._surface.getWidth();
        const h = this._surface.getHeight();

        this._selectionRect = { x: 2, y: 2, w: w - 4, h: h - 4 };

        this._selectionSurface = new Cairo.ImageSurface(Cairo.Format.ARGB32, w - 4, h - 4);
        let crSel = new Cairo.Context(this._selectionSurface);
        crSel.setSourceSurface(this._surface, -2, -2);
        crSel.paint();

        let crMain = new Cairo.Context(this._surface);
        crMain.setOperator(Cairo.Operator.SOURCE);
        if (this._canvasBgColor === 'transparent') {
            crMain.setSourceRGBA(0.0, 0.0, 0.0, 0.0);
        } else if (this._canvasBgColor) {
            crMain.setSourceRGBA(this._canvasBgColor.red, this._canvasBgColor.green, this._canvasBgColor.blue, this._canvasBgColor.alpha);
        } else {
            crMain.setSourceRGB(1.0, 1.0, 1.0);
        }
        crMain.rectangle(2, 2, w - 4, h - 4);
        crMain.fill();
        crMain.setOperator(Cairo.Operator.OVER);

        this._selectionActive = true;
        this._updateTransformButtonsSensitivity();
        this._drawing_area.queue_draw();
    }

    // Color picker
    _pickColor(x, y, isSecondary) {
        pickColor(this, x, y, isSecondary);
    }

    _fixPixbufColors(pixbuf) {
        return fixPixbufColors(pixbuf);
    }

    // Flood fill
    _floodFill(startX, startY, isSecondary) {
        floodFill(this, startX, startY, isSecondary);
    }

    _addFileDialogFilters(dialog) {
        addFileDialogFilters(dialog);
    }

    // Save to file
    _saveCanvasToFile(onSavedCallback = null) {
        saveCanvasToFile(this, onSavedCallback);
    }

    _saveCanvasToFileAs(onSavedCallback = null) {
        saveCanvasToFileAs(this, onSavedCallback);
    }

    _openImageFromFile() {
        openImageFromFile(this);
    }

    _loadImage(fileOrPath) {
        try {
            let file;
            if (typeof fileOrPath === 'string') {
                file = Gio.File.new_for_path(fileOrPath);
            } else {
                file = fileOrPath;
            }
            let texture = Gdk.Texture.new_from_file(file);
            let pixbuf = Gdk.pixbuf_get_from_texture(texture);
            const w = pixbuf.get_width();
            const h = pixbuf.get_height();

            this._initSurface(w, h, pixbuf.get_has_alpha() ? 'transparent' : null);

            let cr = new Cairo.Context(this._surface);
            Gdk.cairo_set_source_pixbuf(cr, pixbuf, 0, 0);
            cr.paint();

            this._saveFilePath = file.get_path() || file.get_uri();
            this._saveGioFile = file;
            this._isModified = false;
            this._updateTitle();
            this._updateCanvasCentering();
            this._drawing_area.queue_draw();

            cr = null;
            texture = null;
            pixbuf = null;
        } catch (err) {
            console.error("Error loading image:", err);
        }

    }

    _updateThemeSelection() {
        const scheme = Adw.StyleManager.get_default().color_scheme;

        // Reset all to unselected
        this._theme_img_system.icon_name = 'theme-auto';
        this._theme_img_light.icon_name = 'theme-light';
        this._theme_img_dark.icon_name = 'theme-dark';

        if (scheme === Adw.ColorScheme.DEFAULT) {
            this._theme_img_system.icon_name = 'theme-auto-selected';
        } else if (scheme === Adw.ColorScheme.FORCE_LIGHT || scheme === Adw.ColorScheme.PREFER_LIGHT) {
            this._theme_img_light.icon_name = 'theme-light-selected';
        } else if (scheme === Adw.ColorScheme.FORCE_DARK || scheme === Adw.ColorScheme.PREFER_DARK) {
            this._theme_img_dark.icon_name = 'theme-dark-selected';
        }
    }

    _updateDynamicCss() {
        const accent = this._getAccentColor();
        const accentHex = `#${Math.round(accent.r * 255).toString(16).padStart(2, '0')}${Math.round(accent.g * 255).toString(16).padStart(2, '0')}${Math.round(accent.b * 255).toString(16).padStart(2, '0')}`;
        const cssData = `
            .primary-popover button label {
                font-weight: normal;
            }
            .primary-popover button.circular {
                min-width: 48px;
                min-height: 48px;
                padding: 0;
            }
            .primary-popover button.circular image {
                min-width: 32px;
                min-height: 32px;
            }
            .options-title {
                font-size: 13px;
                font-weight: bold;
                padding: 4px 0px 8px 0px;
            }
            .text-editor-box {
                border: 1px dashed ${accentHex};
                background-color: rgba(255, 255, 255, 0.9);
                padding: 4px;
            }
            .active-tool-group > button {
                box-shadow: inset 0 -3px 0 0 ${accentHex};
                border-bottom-left-radius: 0px;
                border-bottom-right-radius: 0px;
            }
            .text-style-btn {
                font-size: 14px;
                padding: 4px 8px;
            }
            #box_options {
                min-width: 200px;
            }
            #toolbar_box button,
            #toolbar_box button:hover,
            #toolbar_box button:active,
            #toolbar_box button:checked,
            #toolbar_box button:focus,
            popover button,
            popover togglebutton {
                border-radius: 9999px !important;
            }
            #toolbar_box button {
                min-width: 34px;
                min-height: 34px;
                padding: 4px;
            }
        `;
        this._cssProvider.load_from_data(cssData, -1);
    }

    _createTextEditor(canvasX, canvasY, width, height) {
        if (this._activeTextEditor) {
            this._bakeTextEditor();
        }

        const scrolled = new Gtk.ScrolledWindow({
            hscrollbar_policy: Gtk.PolicyType.NEVER,
            vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
            has_frame: true,
        });
        scrolled.add_css_class('text-editor-box');

        const textView = new Gtk.TextView({
            wrap_mode: Gtk.WrapMode.WORD_CHAR,
            accepts_tab: false,
        });
        textView.set_left_margin(4);
        textView.set_right_margin(4);
        textView.set_top_margin(4);
        textView.set_bottom_margin(4);

        scrolled.set_child(textView);
        scrolled.set_size_request(Math.round(width * this._zoomLevel), Math.round(height * this._zoomLevel));
        scrolled.set_halign(Gtk.Align.START);
        scrolled.set_valign(Gtk.Align.START);
        scrolled.set_margin_start(Math.round(canvasX * this._zoomLevel));
        scrolled.set_margin_top(Math.round(canvasY * this._zoomLevel));

        this._textEditorCssProvider = new Gtk.CssProvider();
        textView.get_style_context().add_provider(
            this._textEditorCssProvider,
            Gtk.STYLE_PROVIDER_PRIORITY_USER
        );

        this._canvas_overlay.add_overlay(scrolled);
        this._activeTextEditor = scrolled;
        this._activeTextTextView = textView;

        const buffer = textView.get_buffer();
        buffer.set_text(this._opt_text_content || '', -1);

        this._updateTextEditorStyle();
        const textKeyCtrl = new Gtk.EventControllerKey();
        textKeyCtrl.connect('key-pressed', (controller, keyval, keycode, state) => {
            const keyName = Gdk.keyval_name(keyval);
            if (keyName === 'Escape') {
                if (this._activeTextEditor) {
                    this._activeTextEditor.unparent();
                    this._activeTextEditor = null;
                    this._activeTextTextView = null;
                    this._drawing_area.queue_draw();
                }
                return true;
            }

        if (this._isGradientActive) {
            this._isGradientActive = false;
            if (this._gradientTimeoutId) {
                GLib.Source.remove(this._gradientTimeoutId);
                this._gradientTimeoutId = 0;
            }
            this._drawing_area.queue_draw();
            return true;
        }
            return false;
        });
        textView.add_controller(textKeyCtrl);

        textView.grab_focus();
    }

    _updateTextEditorStyle() {
        if (!this._activeTextTextView || !this._textEditorCssProvider) return;
        const fontName = this._opt_text_font || 'Sans';
        const fontSize = this._opt_text_size || 24;
        const isBold = this._opt_text_bold ? 'bold' : 'normal';
        const isItalic = this._opt_text_italic ? 'italic' : 'normal';
        const decoration = [
            this._opt_text_underline ? 'underline' : '',
            this._opt_text_strikethrough ? 'line-through' : ''
        ].filter(Boolean).join(' ') || 'none';

        const col = this._getCurrentColor(false);
        const colorStr = `rgba(${Math.round(col.r*255)}, ${Math.round(col.g*255)}, ${Math.round(col.b*255)}, ${col.a})`;

        // Background
        let bgStr = 'transparent';
        if (this._opt_text_bg) {
            const secCol = this._getCurrentColor(true);
            bgStr = `rgba(${Math.round(secCol.r*255)}, ${Math.round(secCol.g*255)}, ${Math.round(secCol.b*255)}, ${secCol.a})`;
        }

        const css = `
            textview text {
                font-family: "${fontName}";
                font-size: ${fontSize}px;
                font-weight: ${isBold};
                font-style: ${isItalic};
                text-decoration: ${decoration};
                color: ${colorStr};
                background-color: ${bgStr};
            }
        `;
        this._textEditorCssProvider.load_from_data(css, -1);
    }

    _bakeTextEditor() {
        if (!this._activeTextEditor || !this._activeTextTextView) return;

        const buffer = this._activeTextTextView.get_buffer();
        const startIter = buffer.get_start_iter();
        const endIter = buffer.get_end_iter();
        const text = buffer.get_text(startIter, endIter, false);

        if (text && text.trim().length > 0) {
            this._saveToUndoStack();
            let cr = new Cairo.Context(this._surface);

            const fontName = this._opt_text_font || 'Sans';
            const fontSize = parseFloat(this._opt_text_size) || 24;

            cr.selectFontFace(fontName,
                              this._opt_text_italic ? Cairo.FontSlant.ITALIC : Cairo.FontSlant.NORMAL,
                              this._opt_text_bold ? Cairo.FontWeight.BOLD : Cairo.FontWeight.NORMAL);
            cr.setFontSize(fontSize);
            cr.setAntialias(this._opt_text_antialias ? Cairo.Antialias.DEFAULT : Cairo.Antialias.NONE);

            // Convert overlay margins back to canvas pixels
            const startX = this._activeTextEditor.get_margin_start() / this._zoomLevel;
            const startY = this._activeTextEditor.get_margin_top() / this._zoomLevel;

            const lines = text.split('\n');
            let currentY = startY + fontSize;

            const col = this._getCurrentColor(false);

            for (const line of lines) {
                const extents = cr.textExtents(line);

                // draw background
                if (this._opt_text_bg) {
                    const pad = 4;
                    const secCol = this._getCurrentColor(true);
                    cr.save();
                    cr.setSourceRGBA(secCol.r, secCol.g, secCol.b, secCol.a);
                    cr.rectangle(startX + extents.xBearing - pad, currentY + extents.yBearing - pad, extents.width + pad * 2, extents.height + pad * 2);
                    cr.fill();
                    cr.restore();
                }

                // draw shadow
                if (this._opt_text_shadow) {
                    cr.save();
                    cr.setSourceRGBA(0, 0, 0, 0.5);
                    cr.moveTo(startX + 2, currentY + 2);
                    cr.showText(line);
                    cr.restore();
                }

                // draw outline
                if (this._opt_text_outline !== 'none') {
                    cr.save();
                    const secCol = this._getCurrentColor(true);
                    cr.setSourceRGBA(secCol.r, secCol.g, secCol.b, secCol.a);
                    cr.setLineWidth(this._opt_text_outline === 'thick' ? 6 : 2);
                    cr.moveTo(startX, currentY);
                    cr.textPath(line);
                    cr.stroke();
                    cr.restore();
                }

                // draw main text
                cr.save();
                cr.setSourceRGBA(col.r, col.g, col.b, col.a);
                cr.moveTo(startX, currentY);
                cr.showText(line);
                cr.restore();

                // underline
                if (this._opt_text_underline) {
                    cr.save();
                    cr.setSourceRGBA(col.r, col.g, col.b, col.a);
                    cr.setLineWidth(fontSize / 12);
                    cr.moveTo(startX + extents.xBearing, currentY + 2);
                    cr.lineTo(startX + extents.xBearing + extents.width, currentY + 2);
                    cr.stroke();
                    cr.restore();
                }

                // strikethrough
                if (this._opt_text_strikethrough) {
                    cr.save();
                    cr.setSourceRGBA(col.r, col.g, col.b, col.a);
                    cr.setLineWidth(fontSize / 12);
                    cr.moveTo(startX + extents.xBearing, currentY + extents.yBearing / 2);
                    cr.lineTo(startX + extents.xBearing + extents.width, currentY + extents.yBearing / 2);
                    cr.stroke();
                    cr.restore();
                }

                currentY += fontSize + 4;
            }

            this._drawing_area.queue_draw();
        }

        this._activeTextEditor.unparent();
        this._activeTextEditor = null;
        this._activeTextTextView = null;
        this._textEditorCssProvider = null;
    }

    _drawPoint(x, y, isSecondary) {
        if (!this._surface) return;

        try {
            this._saveToUndoStack();

            let cr = new Cairo.Context(this._surface);
            const col = this._getCurrentColor(isSecondary);

            const size = Math.max(3, this._brush_size_scale.get_value() * 2);
            const half = size / 2;

            cr.setSourceRGBA(col.r, col.g, col.b, col.a);
            cr.setLineWidth(2);

            const shape = this._opt_points_shape;
            if (shape === 'circle') {
                cr.arc(x, y, half, 0, 2 * Math.PI);
                cr.fill();
            } else if (shape === 'cross') {
                cr.moveTo(x, y - half);
                cr.lineTo(x, y + half);
                cr.moveTo(x - half, y);
                cr.lineTo(x + half, y);
                cr.stroke();
            } else if (shape === 'xcross') {
                cr.moveTo(x - half, y - half);
                cr.lineTo(x + half, y + half);
                cr.moveTo(x + half, y - half);
                cr.lineTo(x - half, y + half);
                cr.stroke();
            } else if (shape === 'square') {
                cr.rectangle(x - half, y - half, size, size);
                cr.fill();
            }

            if (this._opt_points_number) {
                cr.selectFontFace("Sans", Cairo.FontSlant.NORMAL, Cairo.FontWeight.BOLD);
                const numStr = String(this._opt_points_count);
                cr.setFontSize(size * 0.8);
                const ext = cr.textExtents(numStr);

                const textX = x - ext.width / 2;
                const textY = y + ext.height / 2;

                cr.save();
                cr.setSourceRGBA(1, 1, 1, 0.8);
                cr.moveTo(textX - 1, textY - 1); cr.showText(numStr);
                cr.moveTo(textX + 1, textY - 1); cr.showText(numStr);
                cr.moveTo(textX - 1, textY + 1); cr.showText(numStr);
                cr.moveTo(textX + 1, textY + 1); cr.showText(numStr);
                cr.moveTo(textX, textY - 1);     cr.showText(numStr);
                cr.moveTo(textX, textY + 1);     cr.showText(numStr);
                cr.moveTo(textX - 1, textY);     cr.showText(numStr);
                cr.moveTo(textX + 1, textY);     cr.showText(numStr);
                cr.restore();

                const secCol = this._getCurrentColor(true);
                cr.setSourceRGBA(secCol.r, secCol.g, secCol.b, secCol.a);
                cr.moveTo(textX, textY);
                cr.showText(numStr);

                let currentCount = parseInt(this._opt_points_count, 10) || 1;
                this._opt_points_count = currentCount + 1;
                this._updateToolOptions();
            }

            this._drawing_area.queue_draw();

        } catch (e) {
            console.error("Can't create:", e);
        }
    }

    _addOptionLabel(text) {
        let hasChildren = this._box_options.get_first_child() !== null;
        if (hasChildren) {
            const separator = new Gtk.Separator({ orientation: Gtk.Orientation.HORIZONTAL });
            separator.set_margin_top(8);
            separator.set_margin_bottom(8);
            this._box_options.append(separator);
        }

        const label = new Gtk.Label({ label: text, xalign: 0 });
        label.add_css_class('heading');
        this._box_options.append(label);
        return label;
    }

    _addOptionCheck(labelText, stateProp, callback = null) {
        const check = new Gtk.CheckButton({ label: labelText, active: this[stateProp] });
        check.connect('toggled', () => {
            this[stateProp] = check.active;
            if (callback) callback();
        });
        this._box_options.append(check);
        return check;
    }

    _addOptionCombo(labelText, choices, stateProp, callback = null) {
        const box = new Gtk.Box({ spacing: 4, orientation: Gtk.Orientation.VERTICAL });
        const label = new Gtk.Label({ label: labelText, xalign: 0 });
        box.append(label);

        const flowBox = new Gtk.FlowBox({
            selection_mode: Gtk.SelectionMode.NONE,
            max_children_per_line: 2,
            column_spacing: 4,
            row_spacing: 4
        });

        let firstBtn = null;
        for (const choice of choices) {
            const btn = new Gtk.ToggleButton({ label: choice.label });
            btn.add_css_class('flat');
            btn.add_css_class('text-style-btn');

            if (firstBtn) {
                btn.set_group(firstBtn);
            } else {
                firstBtn = btn;
            }

            if (choice.id === this[stateProp]) {
                btn.active = true;
            }

            btn.connect('toggled', () => {
                if (btn.active) {
                    this[stateProp] = choice.id;
                    if (callback) callback();
                }
            });
            flowBox.insert(btn, -1);
        }

        box.append(flowBox);
        this._box_options.append(box);
        return flowBox;
    }

    _addOptionEntry(labelText, stateProp, callback = null) {
        const box = new Gtk.Box({ spacing: 6, orientation: Gtk.Orientation.HORIZONTAL });
        const label = new Gtk.Label({ label: labelText, xalign: 0 });
        box.append(label);

        const entry = new Gtk.Entry({ text: String(this[stateProp]) });
        entry.connect('changed', () => {
            this[stateProp] = entry.text;
            if (callback) callback();
        });
        entry.set_hexpand(true);
        box.append(entry);
        this._box_options.append(box);
        return entry;
    }

    _updateToolOptions() {
        if (!this._box_options) return;
        // Clear
        while (true) {
            const child = this._box_options.get_first_child();
            if (!child) break;
            this._box_options.remove(child);
        }

        // Populate options based on selected tool
        if (this._tool_pencil.active) {
            this._addOptionLabel(_("Pencil options"));
            this._addOptionCombo(_("Line shape:"), [
                { id: 'round', label: _("Round") },
                { id: 'square', label: _("Squared") }
            ], '_opt_pencil_line_shape');
            this._addOptionCheck(_("Contour"), '_opt_pencil_outline');
            this._addOptionCheck(_("Antialiasing"), '_opt_pencil_antialias');

        } else if (this._tool_brush.active) {
            this._addOptionLabel(_("Brush options"));
            this._addOptionCombo(_("Brush type:"), [
                { id: 'simple', label: _("Simple") },
                { id: 'airbrush', label: _("Airbrush") },
                { id: 'hairy', label: _("Hairy") },
                { id: 'calligraphic', label: _("Calligraphic") }
            ], '_opt_brush_type');
            this._addOptionCheck(_("Antialiasing"), '_opt_brush_antialias');

        } else if (this._tool_eraser.active) {
            this._addOptionLabel(_("Eraser options"));
            this._addOptionCombo(_("Eraser type:"), [
                { id: 'normal', label: _("Normal") },
                { id: 'pixel', label: _("Pixel") }
            ], '_opt_eraser_type');
            this._addOptionCombo(_("Eraser mode:"), [
                { id: 'solid', label: _("Solid") },
                { id: 'blur', label: _("Blur") },
                { id: 'mix', label: _("Mix pixels") },
                { id: 'mix_blur', label: _("Mix blur") },
                { id: 'mosaic', label: _("Mosaic") }
            ], '_opt_eraser_mode');
            this._addOptionCombo(_("Substitute with:"), [
                { id: 'transparency', label: _("Transparency") },
                { id: 'default', label: _("Primary color") },
                { id: 'secondary', label: _("Secondary color") }
            ], '_opt_eraser_replace');

        } else if (this._tool_highlight.active) {
            this._addOptionLabel(_("Highlight options"));
            this._addOptionCheck(_("Add transparency"), '_opt_highlight_transparency');
            this._addOptionCheck(_("Straighten"), '_opt_highlight_straighten');
            this._addOptionCombo(_("Background:"), [
                { id: 'light', label: _("Dark text on light background") },
                { id: 'dark', label: _("Light text on dark background") }
            ], '_opt_highlight_bg');
            this._addOptionCheck(_("Antialiasing"), '_opt_highlight_antialias');

        } else if (this._tool_text.active) {
            this._addOptionLabel(_("Text options"));

            // Font picker button
            const fontBox = new Gtk.Box({ spacing: 6, orientation: Gtk.Orientation.HORIZONTAL });
            const fontLabel = new Gtk.Label({ label: _("Font:"), xalign: 0 });
            fontBox.append(fontLabel);

            const fontName = this._opt_text_font || 'Sans';
            const fontSize = this._opt_text_size || 24;
            const fontBtn = new Gtk.FontButton({ font: `${fontName} ${fontSize}` });
            fontBtn.connect('font-set', () => {
                const fontDesc = fontBtn.get_font_desc();
                this._opt_text_font = fontDesc.get_family();
                if (fontDesc.get_size_is_absolute()) {
                    this._opt_text_size = fontDesc.get_size();
                } else {
                    this._opt_text_size = fontDesc.get_size() / 1024;
                }
                if (this._activeTextTextView) {
                    this._updateTextEditorStyle();
                }
            });
            fontBtn.set_hexpand(true);
            fontBtn.set_size_request(100, -1);
            fontBox.append(fontBtn);
            this._box_options.append(fontBox);

            // Style buttons (B, I, U, S)
            const styleBox = new Gtk.Box({ spacing: 6, orientation: Gtk.Orientation.HORIZONTAL });

            const btnBold = new Gtk.ToggleButton({ active: this._opt_text_bold });
            btnBold.add_css_class('text-style-btn');
            const lblBold = new Gtk.Label();
            lblBold.set_markup('<b>B</b>');
            btnBold.set_child(lblBold);
            btnBold.connect('toggled', () => {
                this._opt_text_bold = btnBold.active;
                if (this._activeTextTextView) this._updateTextEditorStyle();
            });

            const btnItalic = new Gtk.ToggleButton({ active: this._opt_text_italic });
            btnItalic.add_css_class('text-style-btn');
            const lblItalic = new Gtk.Label();
            lblItalic.set_markup('<i>I</i>');
            btnItalic.set_child(lblItalic);
            btnItalic.connect('toggled', () => {
                this._opt_text_italic = btnItalic.active;
                if (this._activeTextTextView) this._updateTextEditorStyle();
            });

            const btnUnderline = new Gtk.ToggleButton({ active: this._opt_text_underline });
            btnUnderline.add_css_class('text-style-btn');
            const lblUnderline = new Gtk.Label();
            lblUnderline.set_markup('<u>U</u>');
            btnUnderline.set_child(lblUnderline);
            btnUnderline.connect('toggled', () => {
                this._opt_text_underline = btnUnderline.active;
                if (this._activeTextTextView) this._updateTextEditorStyle();
            });

            const btnStrikethrough = new Gtk.ToggleButton({ active: this._opt_text_strikethrough });
            btnStrikethrough.add_css_class('text-style-btn');
            const lblStrikethrough = new Gtk.Label();
            lblStrikethrough.set_markup('<s>S</s>');
            btnStrikethrough.set_child(lblStrikethrough);
            btnStrikethrough.connect('toggled', () => {
                this._opt_text_strikethrough = btnStrikethrough.active;
                if (this._activeTextTextView) this._updateTextEditorStyle();
            });

            styleBox.append(btnBold);
            styleBox.append(btnItalic);
            styleBox.append(btnUnderline);
            styleBox.append(btnStrikethrough);
            this._box_options.append(styleBox);

            // Background, shadow, outline, antialias
            this._addOptionCheck(_("Background"), '_opt_text_bg', () => {
                if (this._activeTextTextView) this._updateTextEditorStyle();
            });
            this._addOptionCheck(_("Shadow"), '_opt_text_shadow');
            this._addOptionCombo(_("Contour:"), [
                { id: 'none', label: _("None") },
                { id: 'thin', label: _("Thin contour") },
                { id: 'thick', label: _("Thick contour") }
            ], '_opt_text_outline');
            this._addOptionCheck(_("Antialiasing"), '_opt_text_antialias');

        } else if (this._tool_line.active) {
            this._addOptionLabel(_("Line options"));
            this._addOptionCombo(_("Shape:"), [
                { id: 'round', label: _("Round") },
                { id: 'square', label: _("Squared") }
            ], '_opt_line_cap');
            this._addOptionCheck(_("Gradient"), '_opt_line_gradient');
            this._addOptionCheck(_("Contour"), '_opt_line_outline');
            this._addOptionCheck(_("Locked direction"), '_opt_line_locked');
            this._addOptionCheck(_("Arrow"), '_opt_line_arrows');
            this._addOptionCheck(_("Antialiasing"), '_opt_line_antialias');

        } else if (this._tool_rect.active || this._tool_circle.active || this._tool_oval.active || this._tool_polygon.active || this._tool_freeshape.active) {
            this._addOptionLabel(_("Shapes options"));
            this._addOptionCombo(_("Fill:"), [
                { id: 'empty', label: _("Empty") },
                { id: 'primary', label: _("Primary color") },
                { id: 'secondary', label: _("Secondary color") }
            ], '_opt_shapes_fill');
            this._addOptionLabel(_("Outline options"));

            const chkOutline = this._addOptionCheck(_("Draw outline"), '_opt_shapes_outline', () => {
                updateOutlineSensitivity();
                this._drawing_area.queue_draw();
            });

            const comboColorRow = this._addOptionCombo(_("Outline color:"), [
                { id: 'primary', label: _('Primary color') },
                { id: 'secondary', label: _('Secondary color') }
            ], '_opt_shapes_outline_color');

            const thicknessBox = new Gtk.Box({ spacing: 6, orientation: Gtk.Orientation.HORIZONTAL });
            thicknessBox.set_hexpand(true);

            const lblThickness = new Gtk.Label({ label: _("Outline thickness:"), xalign: 0 });
            thicknessBox.append(lblThickness);

            const adjThickness = new Gtk.Adjustment({ lower: 1, upper: 50, step_increment: 1, page_increment: 5, value: this._opt_shapes_outline_thickness });
            const scaleThickness = new Gtk.Scale({
                orientation: Gtk.Orientation.HORIZONTAL,
                adjustment: adjThickness,
                draw_value: true,
                value_pos: Gtk.PositionType.RIGHT,
                hexpand: true
            });
            scaleThickness.set_digits(0);
            scaleThickness.set_size_request(120, -1);

            scaleThickness.connect('value-changed', () => {
                this._opt_shapes_outline_thickness = Math.round(scaleThickness.get_value());
                this._drawing_area.queue_draw();
            });
            thicknessBox.append(scaleThickness);
            this._box_options.append(thicknessBox);

            const updateOutlineSensitivity = () => {
                const active = this._opt_shapes_outline;
                comboColorRow.set_sensitive(active);
                lblThickness.set_sensitive(active);
                scaleThickness.set_sensitive(active);
            };

            updateOutlineSensitivity();

        } else if (this._tool_bucket.active) {
            this._addOptionLabel(_("Fill options"));
            this._addOptionCombo(_("Type:"), [
                { id: 'accerchia', label: _("Circle and fill") },
                { id: 'cancella', label: _("Remove and substitute") },
                { id: 'intera', label: _("Whole image") },
                { id: 'rimuovi', label: _("Remove color") },
                { id: 'gradiente', label: _("Linear gradient") }
            ], '_opt_fill_mode');

        } else if (this._tool_select_rect.active || this._tool_select_free.active) {
            this._addOptionLabel(_("Selection options"));
            this._addOptionCombo(_("Type:"), [
                { id: 'standard', label: _('Standard') },
                { id: 'transparent', label: _('Transparent selection') },
                { id: 'invert', label: _('Invert selection') }
            ], '_opt_select_mode', () => {
                this._drawing_area.queue_draw();
            });

            this._addOptionLabel(_("Transform"));
            const transformBox = new Gtk.Box({ spacing: 4, orientation: Gtk.Orientation.HORIZONTAL, hexpand: true });

            const btnRotL = new Gtk.Button({ icon_name: 'object-rotate-left-symbolic', hexpand: true });
            btnRotL.connect('clicked', () => this._transformSelection('rotate-left'));

            const btnRotR = new Gtk.Button({ icon_name: 'object-rotate-right-symbolic', hexpand: true });
            btnRotR.connect('clicked', () => this._transformSelection('rotate-right'));

            const btnFlipH = new Gtk.Button({ icon_name: 'object-flip-horizontal-symbolic', hexpand: true });
            btnFlipH.connect('clicked', () => this._transformSelection('flip-horizontal'));

            const btnFlipV = new Gtk.Button({ icon_name: 'object-flip-vertical-symbolic', hexpand: true });
            btnFlipV.connect('clicked', () => this._transformSelection('flip-vertical'));

            const isSel = !!this._selectionActive;
            btnRotL.set_sensitive(isSel);
            btnRotR.set_sensitive(isSel);
            btnFlipH.set_sensitive(isSel);
            btnFlipV.set_sensitive(isSel);

            this._transformButtons = [btnRotL, btnRotR, btnFlipH, btnFlipV];

            transformBox.append(btnRotL);
            transformBox.append(btnRotR);
            transformBox.append(btnFlipH);
            transformBox.append(btnFlipV);
            this._box_options.append(transformBox);
        }
    }

    _updateTransformButtonsSensitivity() {
        if (this._transformButtons) {
            const isSel = !!this._selectionActive;
            for (const btn of this._transformButtons) {
                if (btn) btn.set_sensitive(isSel);
            }
        }
    }

    _getCanvasResizeHit(mx, my) {
        const hs = 10;
        const cw = this._canvasWidth * this._zoomLevel;
        const ch = this._canvasHeight * this._zoomLevel;

        const handles = [
            { x: cw, y: ch / 2, id: 'right' },
            { x: cw / 2, y: ch, id: 'bottom' },
            { x: cw, y: ch, id: 'corner' }
        ];

        for (const h of handles) {
            if (Math.abs(mx - h.x) <= hs && Math.abs(my - h.y) <= hs) {
                return h.id;
            }
        }
        return null;
    }

    _resizeCanvasSurface(newW, newH) {
        if (newW === this._canvasWidth && newH === this._canvasHeight) return;

        let newSurface = new Cairo.ImageSurface(Cairo.Format.ARGB32, newW, newH);
        let cr = new Cairo.Context(newSurface);

        cr.setOperator(Cairo.Operator.SOURCE);
        if (this._canvasBgColor) {
            cr.setSourceRGBA(this._canvasBgColor.red, this._canvasBgColor.green, this._canvasBgColor.blue, this._canvasBgColor.alpha);
        } else {
            cr.setSourceRGB(1.0, 1.0, 1.0);
        }
        cr.paint();
        cr.setOperator(Cairo.Operator.OVER);

        if (this._surface) {
            cr.setSourceSurface(this._surface, 0, 0);
            cr.paint();
        }

        this._surface = newSurface;
        this._canvasWidth = newW;
        this._canvasHeight = newH;

if (this._backupSurface && typeof this._backupSurface.destroy === 'function') {
        this._backupSurface.destroy();
    }

        this._backupSurface = new Cairo.ImageSurface(Cairo.Format.ARGB32, newW, newH);
        let crBackup = new Cairo.Context(this._backupSurface);
        crBackup.setSourceSurface(this._surface, 0, 0);
        crBackup.paint();

        this._updateCanvasSizeRequest();
        this._drawing_area.queue_draw();
        this._updateStatusDims();
    }

    _transformSelection(op) {
        if (!this._selectionActive || !this._selectionSurface) return;

        this._saveToUndoStack();

        const w = this._selectionSurface.getWidth();
        const h = this._selectionSurface.getHeight();

        let newW = w;
        let newH = h;
        if (op === 'rotate-left' || op === 'rotate-right') {
            newW = h;
            newH = w;
        }

        const newSurface = new Cairo.ImageSurface(Cairo.Format.ARGB32, newW, newH);
        let cr = new Cairo.Context(newSurface);

        if (op === 'rotate-right') {
            cr.translate(newW, 0);
            cr.rotate(Math.PI / 2);
        } else if (op === 'rotate-left') {
            cr.translate(0, newH);
            cr.rotate(-Math.PI / 2);
        } else if (op === 'flip-horizontal') {
            cr.translate(w, 0);
            cr.scale(-1, 1);
        } else if (op === 'flip-vertical') {
            cr.translate(0, h);
            cr.scale(1, -1);
        }

        cr.setSourceSurface(this._selectionSurface, 0, 0);
        cr.paint();

        if (op === 'invert') {
            cr.save();
            cr.setOperator(Cairo.Operator.ATOP);
            cr.setSourceRGB(1.0, 1.0, 1.0);
            cr.rectangle(0, 0, w, h);
            cr.fill();
            cr.restore();

            cr.save();
            cr.setOperator(Cairo.Operator.DIFFERENCE);
            cr.setSourceSurface(this._selectionSurface, 0, 0);
            cr.paint();
            cr.restore();
        }
        cr = null;

        let oldSelection = this._selectionSurface;
        this._selectionSurface = newSurface;
        if (oldSelection && typeof oldSelection.destroy === 'function') {
            oldSelection.destroy();
        }
        oldSelection = null;

        const oldRect = this._selectionRect;
        this._selectionRect = {
            x: Math.round(oldRect.x + (oldRect.w - newW) / 2),
            y: Math.round(oldRect.y + (oldRect.h - newH) / 2),
            w: newW,
            h: newH
        };

        this._drawing_area.queue_draw();
    }

    _newWindow() {
        const app = this.get_application();
        const newWin = new GnomepaintWindow(app);
        newWin.present();
    }

    _newFromClipboard() {
        const clipboard = this.get_clipboard();
        clipboard.read_texture_async(null, (clipboard, result) => {
            try {
                const texture = clipboard.read_texture_finish(result);
                if (texture) {
                    const pixbuf = Gdk.pixbuf_get_from_texture(texture);
                    if (pixbuf) {
                        const width = pixbuf.get_width();
                        const height = pixbuf.get_height();

                        this._bakeSelection();
                        this._initSurface(width, height, pixbuf.get_has_alpha() ? 'transparent' : null);

                        let cr = new Cairo.Context(this._surface);
                        Gdk.cairo_set_source_pixbuf(cr, pixbuf, 0, 0);
                        cr.paint();

                        cr = null;
                        pixbuf = null;
                    }
                    texture = null;

                    this._isModified = true;
                    this._drawing_area.queue_draw();
                }
            } catch (err) {
                console.error("Error reading image from clipboard:", err);
            }
        });
    }

    _confirmUnsaved(actionCallback) {
        if (!this._isModified) {
            actionCallback();
            return;
        }
        const dialog = new Adw.MessageDialog({
            transient_for: this,
            heading: _("Save changes?"),
            body: _("Your drawing has unsaved changes. Do you want to save them before continuing?"),
            close_response: "cancel"
        });
        dialog.add_response("cancel", _("Cancel"));
        dialog.add_response("discard", _("Discard"));
        dialog.add_response("save", _("Save"));
        dialog.set_response_appearance("discard", Adw.ResponseAppearance.DESTRUCTIVE);
        dialog.set_response_appearance("save", Adw.ResponseAppearance.SUGGESTED);

        dialog.connect('response', (self, response) => {
            if (response === 'save') {
                this._saveCanvasToFile(() => {
                    this._isModified = false;
                    actionCallback();
                });
            } else if (response === 'discard') {
                this._isModified = false;
                actionCallback();
            }

            dialog.destroy();
            System.gc();
        });
        dialog.present();
    }

    _confirmSaveAndClose() {
        const dialog = new Adw.MessageDialog({
            transient_for: this,
            heading: _("Save changes?"),
            body: _("Your drawing has unsaved changes. Do you want to save them before closing?"),
            close_response: "cancel"
        });
        dialog.add_response("cancel", _("Cancel"));
        dialog.add_response("discard", _("Discard"));
        dialog.add_response("save", _("Save"));
        dialog.set_response_appearance("discard", Adw.ResponseAppearance.DESTRUCTIVE);
        dialog.set_response_appearance("save", Adw.ResponseAppearance.SUGGESTED);

        dialog.connect('response', (self, response) => {
            if (response === 'save') {
                this._saveCanvasToFile(() => {
                    this._isModified = false;
                    this._saveSettings();
                    this.destroy();
                });
            } else if (response === 'discard') {
                this._isModified = false;
                this._saveSettings();
                this.destroy();
            }
            dialog.destroy();
            System.gc();
        });
        dialog.present();
    }

    _updateRenamePopover() {
        const hasPath = !!this._saveFilePath;
        this._box_rename_unsaved.set_visible(!hasPath);
        this._box_rename_saved.set_visible(hasPath);

        if (hasPath) {
            this._entry_rename.set_text(this._getFileDisplayName(this._saveFilePath));
            this._lbl_rename_path.set_label(this._getDisplayFolder(this._saveFilePath));
        }
    }

    _renameFile() {
        if (!this._saveFilePath) return;

        let newName = this._entry_rename.get_text().trim();
        if (!newName) return;

        try {
            this._bakeSelection();
            const oldFile = this._saveGioFile || Gio.File.new_for_path(this._saveFilePath);
            const oldName = oldFile.get_basename();

            const extIdx = oldName.lastIndexOf('.');
            if (extIdx !== -1) {
                const ext = oldName.substring(extIdx);
                if (!newName.toLowerCase().endsWith(ext.toLowerCase()) && !newName.includes('.'))
                    newName += ext;
            }

            const parent = oldFile.get_parent();
            if (!parent)
                return;

            const parentPath = parent.get_path() || GLib.filename_from_uri(parent.get_uri(), null);
            const newPath = GLib.build_filenamev([parentPath, newName]);
            const newFile = Gio.File.new_for_path(newPath);

            if (oldFile.equal(newFile)) {
                this._popover_rename.popdown();
                return;
            }

            const width = this._surface.getWidth();
            const height = this._surface.getHeight();
            let pixbuf = Gdk.pixbuf_get_from_surface(this._surface, 0, 0, width, height);
            if (pixbuf) {
                let format = 'png';
                const lower = newPath.toLowerCase();
                if (lower.endsWith('.jpg') || lower.endsWith('.jpeg'))
                    format = 'jpeg';
                else if (lower.endsWith('.bmp'))
                    format = 'bmp';

                const stream = newFile.replace(null, false, Gio.FileCreateFlags.NONE, null);
                pixbuf.save_to_streamv(stream, format, [], [], null);
                stream.flush(null);
                stream.close(null);
            }

            if (!oldFile.equal(newFile)) {
                try {
                    oldFile.delete(null);
                } catch (e) {
                    console.warn('Could not delete old file after rename, ignoring:', e);
                }
            }

            this._saveFilePath = newPath;
            this._saveGioFile = newFile;
            this._isModified = false;
            this._updateTitle();
            this._updateRenamePopover();
        } catch (err) {
            console.error('Error renaming file:', err);
        }
        this._popover_rename.popdown();
    }

    _importImage() {
        importImage(this);
    }

    _printImage() {
        if (!this._surface) return;
        this._bakeSelection();

        const print = new Gtk.PrintOperation();
        print.set_n_pages(1);
        print.set_use_full_page(false);
        print.set_unit(Gtk.Unit.POINTS);

        print.connect('draw-page', (operation, context, page_num) => {
            const cr = context.get_cairo_context();
            const width = this._surface.getWidth();
            const height = this._surface.getHeight();
            const pageW = context.get_width();
            const pageH = context.get_height();
            const scale = Math.min(pageW / width, pageH / height) * 0.92;
            const offX = (pageW - width * scale) / 2;
            const offY = (pageH - height * scale) / 2;

            cr.save();
            cr.setSourceRGB(1, 1, 1);
            cr.rectangle(0, 0, pageW, pageH);
            cr.fill();
            cr.translate(offX, offY);
            cr.scale(scale, scale);
            cr.setSourceSurface(this._surface, 0, 0);
            cr.paint();
            cr.restore();
        });

        try {
            print.run(Gtk.PrintOperationAction.PRINT_DIALOG, this);
        } catch (e) {
            console.error('Print error:', e);
        }
    }

    _showProperties() {
        const win = new Adw.Window({
            transient_for: this,
            modal: true,
            title: _('Image Properties'),
            default_width: 420,
            default_height: 520,
        });

        win.connect('close-request', () => {
          win.destroy();
          System.gc();
          return false;
        });

        const toolbarView = new Adw.ToolbarView();
        const header = new Adw.HeaderBar();
        const titleWidget = new Adw.WindowTitle({
            title: _('Image Properties'),
        });
        header.set_title_widget(titleWidget);
        toolbarView.add_top_bar(header);

        const scrolled = new Gtk.ScrolledWindow({
            vexpand: true,
            hscrollbar_policy: Gtk.PolicyType.NEVER,
        });
        const content = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL });
        content.set_margin_start(24);
        content.set_margin_end(24);
        content.set_margin_top(16);
        content.set_margin_bottom(16);

        const imageGroup = new Adw.PreferencesGroup({ title: _('Image') });
        imageGroup.add(new Adw.ActionRow({
            title: _('Dimensions'),
            subtitle: `${this._canvasWidth} × ${this._canvasHeight} px`,
        }));
        imageGroup.add(new Adw.ActionRow({
            title: _('Color mode'),
            subtitle: _('ARGB32 (with alpha channel)'),
        }));
        imageGroup.add(new Adw.ActionRow({
            title: _('Zoom level'),
            subtitle: `${Math.round(this._zoomLevel * 100)}%`,
        }));
        imageGroup.add(new Adw.ActionRow({
            title: _('Total pixels'),
            subtitle: `${(this._canvasWidth * this._canvasHeight).toLocaleString()}`,
        }));
        content.append(imageGroup);

        const fileGroup = new Adw.PreferencesGroup({ title: _('File') });
        const fileName = this._saveFilePath ? this._getFileDisplayName(this._saveFilePath) : _('Untitled');
        fileGroup.add(new Adw.ActionRow({
            title: _('Name'),
            subtitle: fileName,
        }));

        let sizeText = _('Not saved yet');
        let modifiedText = this._isModified ? _('Yes') : _('No');
        let formatText = _('PNG (default)');
        if (this._saveFilePath) {
            try {
                const file = Gio.File.new_for_path(this._saveFilePath);
                const info = file.query_info('standard::size,time::modified', Gio.FileQueryInfoFlags.NONE, null);
                sizeText = this._formatFileSize(info.get_size());
                const modified = info.get_modification_date_time();
                if (modified)
                    modifiedText = modified.format('%c');
                const lower = this._saveFilePath.toLowerCase();
                if (lower.endsWith('.jpg') || lower.endsWith('.jpeg'))
                    formatText = 'JPEG';
                else if (lower.endsWith('.bmp'))
                    formatText = 'BMP';
                else if (lower.endsWith('.png'))
                    formatText = 'PNG';
            } catch (e) {}
        }
        fileGroup.add(new Adw.ActionRow({
            title: _('Size'),
            subtitle: sizeText,
        }));
        fileGroup.add(new Adw.ActionRow({
            title: _('Format'),
            subtitle: formatText,
        }));
        fileGroup.add(new Adw.ActionRow({
            title: _('Last modified'),
            subtitle: modifiedText,
        }));
        fileGroup.add(new Adw.ActionRow({
            title: _('Folder'),
            subtitle: this._getDisplayFolder(this._saveFilePath),
        }));
        if (this._saveFilePath) {
            fileGroup.add(new Adw.ActionRow({
                title: _('Full path'),
                subtitle: this._saveFilePath,
            }));
        }
        content.append(fileGroup);

        const canvasGroup = new Adw.PreferencesGroup({ title: _('Canvas') });
        const bgLabel = this._canvasBgColor === 'transparent'
            ? _('Transparent')
            : (this._canvasBgColor ? _('Custom color') : _('White'));
        canvasGroup.add(new Adw.ActionRow({
            title: _('Background'),
            subtitle: bgLabel,
        }));
        canvasGroup.add(new Adw.ActionRow({
            title: _('Show grid'),
            subtitle: this._showGrid ? _('Yes') : _('No'),
        }));
        canvasGroup.add(new Adw.ActionRow({
            title: _('Pixel view'),
            subtitle: this._pixelView ? _('Yes') : _('No'),
        }));
        content.append(canvasGroup);

        scrolled.set_child(content);
        toolbarView.set_content(scrolled);
        win.set_content(toolbarView);
        win.present();
    }

    _showSelectionContextMenu(x, y) {
        if (this._popover_context_menu) {
            this._popover_context_menu.unparent();
            this._popover_context_menu = null;
        }

        const popover = new Gtk.Popover();
        popover.set_parent(this._drawing_area);
        popover.set_autohide(true);
        popover.set_has_arrow(false);

        const box = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 4 });
        box.set_margin_start(4);
        box.set_margin_end(4);
        box.set_margin_top(4);
        box.set_margin_bottom(4);

        const actionRow = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 4, halign: Gtk.Align.CENTER });

        const addIconBtn = (iconName, tooltipText, callback) => {
            const btn = new Gtk.Button({
                icon_name: iconName,
                tooltip_text: tooltipText,
                has_tooltip: true
            });
            btn.add_css_class('flat');
            btn.connect('clicked', () => {
                popover.popdown();
                callback();
            });
            actionRow.append(btn);
        };

        addIconBtn('edit-cut-symbolic', _("Cut"), () => this._cutSelection());
        addIconBtn('edit-copy-symbolic', _("Copy"), () => this._copySelection());
        addIconBtn('edit-paste-symbolic', _("Paste"), () => this._pasteSelection());

        box.append(actionRow);

        const separator = new Gtk.Separator({ orientation: Gtk.Orientation.HORIZONTAL });
        box.append(separator);

        const addMenuBtn = (label, callback) => {
            const btn = new Gtk.Button();
            const lbl = new Gtk.Label({ label: label, xalign: 0 });
            btn.set_child(lbl);
            btn.add_css_class('flat');
            btn.connect('clicked', () => {
                popover.popdown();
                callback();
            });
            box.append(btn);
        };

        addMenuBtn(_("Delete"), () => this._deleteSelection());
        addMenuBtn(_("Invert selection colors"), () => this._transformSelection('invert'));

        popover.set_child(box);
        this._popover_context_menu = popover;

        const rect = new Gdk.Rectangle({ x: x, y: y, width: 1, height: 1 });
        this._popover_context_menu.set_pointing_to(rect);
        this._popover_context_menu.popup();
    }

    _updateActiveGroupStyle() {
        this._btn_selection.remove_css_class('active-tool-group');
        this._btn_paint.remove_css_class('active-tool-group');
        this._btn_shapes.remove_css_class('active-tool-group');

        if (this._tool_select_rect.active || this._tool_select_free.active) {
            this._btn_selection.add_css_class('active-tool-group');
        } else if (this._tool_brush.active || this._tool_pencil.active || this._tool_eraser.active ||
                   this._tool_highlight.active || this._tool_bucket.active || this._tool_picker.active ||
                   this._tool_text.active) {
            this._btn_paint.add_css_class('active-tool-group');
        } else {
            this._btn_shapes.add_css_class('active-tool-group');
        }
    }

    _updateColorButtonsSensitivity() {
        const isSelection = this._tool_select_rect.active || this._tool_select_free.active;
        const isPicker = this._tool_picker.active;
        const isEraser = this._tool_eraser.active;

        // Colors are useful for all except selection, picker, and eraser
        const colorsSensitive = !isSelection && !isPicker && !isEraser;
        this._color_button.set_sensitive(colorsSensitive);
        this._color_button_secondary.set_sensitive(colorsSensitive);
        if (this._btn_swap_colors) {
            this._btn_swap_colors.set_sensitive(colorsSensitive);
        }

        // Thickness is useful for brush, pencil, highlighter, eraser, and shapes (line, rect, rounded_rect, oval, circle, polygon, freeshape, points)
        const isBrush = this._tool_brush.active;
        const isPencil = this._tool_pencil.active;
        const isHighlight = this._tool_highlight.active;
        const isShape = this._tool_line.active || this._tool_rect.active;

        const thicknessSensitive = isBrush || isPencil || isHighlight || isEraser || isShape;
        this._btn_thickness.set_sensitive(thicknessSensitive);
    }

    _updateCursor(x, y) {
        const canvasResizeHit = this._getCanvasResizeHit(x, y);
        if (canvasResizeHit) {
            if (canvasResizeHit === 'right') {
                this._drawing_area.set_cursor_from_name('ew-resize');
            } else if (canvasResizeHit === 'bottom') {
                this._drawing_area.set_cursor_from_name('ns-resize');
            } else if (canvasResizeHit === 'corner') {
                this._drawing_area.set_cursor_from_name('nwse-resize');
            }
            return;
        }

        if (this._selectionActive) {
            const zX = x / this._zoomLevel;
            const zY = y / this._zoomLevel;
            const hit = this._getSelectionHit(zX, zY);
            if (hit >= 0) {
                if (hit === 8) {
                    this._drawing_area.set_cursor_from_name('move');
                } else if (hit === 0 || hit === 7) {
                    this._drawing_area.set_cursor_from_name('nwse-resize');
                } else if (hit === 2 || hit === 5) {
                    this._drawing_area.set_cursor_from_name('nesw-resize');
                } else if (hit === 1 || hit === 6) {
                    this._drawing_area.set_cursor_from_name('ns-resize');
                } else if (hit === 3 || hit === 4) {
                    this._drawing_area.set_cursor_from_name('ew-resize');
                }
                return;
            }
        }

        if (this._tool_picker && this._tool_picker.active) {
            const zX = x / this._zoomLevel;
            const zY = y / this._zoomLevel;
            const width = this._surface ? this._surface.getWidth() : 0;
            const height = this._surface ? this._surface.getHeight() : 0;
            const px = Math.floor(Math.max(0, Math.min(zX, width - 1)));
            const py = Math.floor(Math.max(0, Math.min(zY, height - 1)));

            let r = 255, g = 255, b = 255;
            if (this._surface && width > 0 && height > 0) {
                let pixbuf = Gdk.pixbuf_get_from_surface(this._surface, px, py, 1, 1);
                if (pixbuf) {
                    pixbuf = this._fixPixbufColors(pixbuf);
                    const data = pixbuf.get_pixels();
                    r = data[0];
                    g = data[1];
                    b = data[2];
                }
                pixbuf = null;
            }

            if (this._lastPickerR === r && this._lastPickerG === g && this._lastPickerB === b) {
                return;
            }
            this._lastPickerR = r;
            this._lastPickerG = g;
            this._lastPickerB = b;

            // Draw a custom cursor: a circular color preview surrounded by a high-contrast crosshair
            const cursorSize = 32;
            const cursorSurface = new Cairo.ImageSurface(Cairo.Format.ARGB32, cursorSize, cursorSize);
            const cr = new Cairo.Context(cursorSurface);

            // Double border (black, then white) for high contrast on any background
            cr.setLineWidth(2.5);
            cr.setSourceRGBA(1, 1, 1, 1.0); // White outer border
            cr.arc(16, 16, 8, 0, 2 * Math.PI);
            cr.stroke();

            cr.setLineWidth(1);
            cr.setSourceRGBA(0, 0, 0, 1.0); // Black inner border
            cr.arc(16, 16, 8, 0, 2 * Math.PI);
            cr.stroke();

            // Fill with hovered pixel color
            cr.arc(16, 16, 7.5, 0, 2 * Math.PI);
            cr.setSourceRGBA(r / 255, g / 255, b / 255, 1.0);
            cr.fill();

            // Center target dot
            cr.arc(16, 16, 1, 0, 2 * Math.PI);
            cr.setSourceRGBA(0, 0, 0, 1.0);
            cr.fill();

            // Crosshair lines (white background)
            cr.setLineWidth(1.5);
            cr.setSourceRGBA(1, 1, 1, 1.0);
            cr.moveTo(16, 2);  cr.lineTo(16, 5);
            cr.moveTo(16, 27); cr.lineTo(16, 30);
            cr.moveTo(2, 16);  cr.lineTo(5, 16);
            cr.moveTo(27, 16); cr.lineTo(30, 16);
            cr.stroke();

            // Crosshair lines (black foreground)
            cr.setLineWidth(1.0);
            cr.setSourceRGBA(0, 0, 0, 1.0);
            cr.moveTo(16, 2);  cr.lineTo(16, 5);
            cr.moveTo(16, 27); cr.lineTo(16, 30);
            cr.moveTo(2, 16);  cr.lineTo(5, 16);
            cr.moveTo(27, 16); cr.lineTo(30, 16);
            cr.stroke();

            try {
                let cursorPixbuf = Gdk.pixbuf_get_from_surface(cursorSurface, 0, 0, cursorSize, cursorSize);
                const texture = Gdk.Texture.new_for_pixbuf(cursorPixbuf);
                const cursor = Gdk.Cursor.new_from_texture(texture, 16, 16, null);
                this._drawing_area.set_cursor(cursor);
                if (typeof cursorSurface.destroy === 'function') {
                    cursorSurface.destroy();
                }
                cursorCr = null;
                cursorPixbuf = null;
                cursorSurface = null;
            } catch (err) {
                console.error("Error setting custom picker cursor:", err);
                this._drawing_area.set_cursor_from_name('color-picker');
            }
        } else if (this._tool_select_rect.active || this._tool_select_free.active) {
            this._drawing_area.set_cursor_from_name('crosshair');
        } else {
            this._drawing_area.set_cursor_from_name('default');
        }

    }

    _getAccentColor() {

        if (this._cachedAccentColor) {
          return this._cachedAccentColor;
        }
        const tempButton = new Gtk.Button();
        tempButton.add_css_class('suggested-action');
        try {
            const [found, rgba] = tempButton.get_style_context().lookup_color('accent_bg_color');
            if (found && rgba) {
                return { r: rgba.red, g: rgba.green, b: rgba.blue };
            }
            const [foundOld, rgbaOld] = tempButton.get_style_context().lookup_color('theme_selected_bg_color');
            if (foundOld && rgbaOld) {
                return { r: rgbaOld.red, g: rgbaOld.green, b: rgbaOld.blue };
            }
            return { r: 0.2, g: 0.4, b: 0.8 };
        } catch {
            return { r: 0.2, g: 0.4, b: 0.8 };
        }
    }

    _resolveFilePath(file) {
        if (!file)
            return null;
        const path = file.get_path();
        if (path)
            return path;
        const uri = file.get_uri();
        if (uri && uri.startsWith('file://'))
            return GLib.filename_from_uri(uri, null);
        return uri;
    }

    _getDisplayFolder(path) {
        if (!path)
            return _('Not saved');
        try {
            const file = path.startsWith('file://')
                ? Gio.File.new_for_uri(path)
                : Gio.File.new_for_path(path);
            const parent = file.get_parent();
            if (!parent)
                return path;
            let parentPath = parent.get_path();
            if (!parentPath) {
                const parentUri = parent.get_uri();
                if (parentUri && parentUri.startsWith('file://'))
                    parentPath = GLib.filename_from_uri(parentUri, null);
                else
                    return parentUri || path;
            }
            const home = GLib.get_home_dir();
            if (parentPath.startsWith(home))
                return `~${parentPath.substring(home.length)}`;
            return parentPath;
        } catch {
            return path;
        }
    }

    _getFileDisplayName(path) {
        if (!path)
            return _('Untitled');
        try {
            const file = path.startsWith('file://')
                ? Gio.File.new_for_uri(path)
                : Gio.File.new_for_path(path);
            const info = file.query_info('standard::display-name', Gio.FileQueryInfoFlags.NONE, null);
            return info.get_display_name();
        } catch {
            const parts = path.split(/[/\\]/);
            return parts[parts.length - 1] || _('Untitled');
        }
    }

    _formatFileSize(bytes) {
        if (bytes < 1024)
            return `${bytes} B`;
        if (bytes < 1024 * 1024)
            return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }

    _updateTitle() {
        let name = this._getFileDisplayName(this._saveFilePath);
        if (!this._saveFilePath)
            name = _('Untitled');
        this._lbl_title.set_label(`${name} - GPaint`);
    }

    _getSettingsFilePath() {
        const configDir = GLib.get_user_config_dir();
        return GLib.build_filenamev([configDir, 'gpaint_settings.json']);
    }

    _loadSettings() {
        try {
            const path = this._getSettingsFilePath();
            const file = Gio.File.new_for_path(path);
            if (file.query_exists(null)) {
                const [success, contents] = file.load_contents(null);
                if (success) {
                    const data = JSON.parse(new TextDecoder().decode(contents));

                    if (data.showLabels !== undefined) {
                        this._showLabelsSetting = data.showLabels;
                    }
                    if (data.centerCanvas !== undefined) {
                        this._centerCanvas = data.centerCanvas;
                    }
                    if (data.showStatusBar !== undefined) {
                        this._showStatusBar = data.showStatusBar;
                    }
                    if (data.toolbarAtTop !== undefined) {
                        this._toolbarAtTop = data.toolbarAtTop;
                    }
                    if (data.canvasWidth !== undefined) {
                        this._savedCanvasWidth = data.canvasWidth;
                    }
                    if (data.canvasHeight !== undefined) {
                        this._savedCanvasHeight = data.canvasHeight;
                    }
                    if (data.primaryColor) {
                        this._savedPrimaryColor = data.primaryColor;
                    }
                    if (data.secondaryColor) {
                        this._savedSecondaryColor = data.secondaryColor;
                    }
                    if (data.prefClearMode !== undefined) {
                        this._pref_clear_mode = data.prefClearMode;
                    }
                    if (data.prefClearColor !== undefined) {
                        this._pref_clear_color.parse(data.prefClearColor);
                    }
                    if (data.prefSaveMode !== undefined) {
                        this._pref_save_mode = data.prefSaveMode;
                    }
                    if (data.prefSaveColor !== undefined) {
                        this._pref_save_color.parse(data.prefSaveColor);
                    }
                    if (data.prefGridStep !== undefined) {
                        this._pref_grid_step = data.prefGridStep;
                    }
                    if (data.prefGridColor !== undefined) {
                        this._pref_grid_color.parse(data.prefGridColor);
                    }
                    if (data.clearConfirm !== undefined){
                        this._pref_clear_confirm = data.clearConfirm;
                    }
                    if (data.showGrid !== undefined)
                        this._showGrid = data.showGrid;
                    if (data.pixelView !== undefined)
                        this._pixelView = data.pixelView;
                }
            }
        } catch (err) {
            console.error("Error loading settings:", err);
        }
    }

    _saveSettings() {
        try {
            const path = this._getSettingsFilePath();
            const file = Gio.File.new_for_path(path);
            const parent = file.get_parent();
            if (!parent.query_exists(null)) {
                parent.make_directory_with_parents(null);
            }

            const data = {
                showLabels: this._showLabelsSetting,
                centerCanvas: this._centerCanvas,
                showStatusBar: this._showStatusBar,
                toolbarAtTop: this._toolbarAtTop,
                canvasWidth: this._canvasWidth,
                canvasHeight: this._canvasHeight,
                primaryColor: this._color_button.get_rgba().to_string(),
                secondaryColor: this._color_button_secondary.get_rgba().to_string(),
                prefClearMode: this._pref_clear_mode,
                prefClearColor: this._pref_clear_color.to_string(),
                prefSaveMode: this._pref_save_mode,
                prefSaveColor: this._pref_save_color.to_string(),
                prefGridStep: this._pref_grid_step,
                prefGridColor: this._pref_grid_color.to_string(),
                clearConfirm: this._pref_clear_confirm,
                showGrid: this._showGrid,
                pixelView: this._pixelView,
            };

            const contents = new TextEncoder().encode(JSON.stringify(data, null, 2));
            file.replace_contents(contents, null, false, Gio.FileCreateFlags.NONE, null);
        } catch (err) {
            console.error("Error saving settings:", err);
        }
    }

    _updateStatusDims() {
        if (this._lbl_status_dims) {
            this._lbl_status_dims.set_label(`${this._canvasWidth} x ${this._canvasHeight} px`);
        }
    }

    _updateStatusZoom() {
        if (this._lbl_status_zoom) {
            this._lbl_status_zoom.set_label(`${Math.round(this._zoomLevel * 100)}%`);
        }
        if (this._entry_zoom_value) {
            this._entry_zoom_value.set_text(`${Math.round(this._zoomLevel * 100)}%`);
        }
        if (this._scale_zoom) {
            const adj = this._scale_zoom.get_adjustment();
            if (Math.abs(adj.get_value() - this._zoomLevel) > 0.001) {
                adj.set_value(this._zoomLevel);
            }
        }
    }

    _updateCanvasCentering() {
        if (this._canvas_overlay) {
            if (this._centerCanvas) {
                this._canvas_overlay.set_halign(Gtk.Align.CENTER);
                this._canvas_overlay.set_valign(Gtk.Align.CENTER);
            } else {
                this._canvas_overlay.set_halign(Gtk.Align.START);
                this._canvas_overlay.set_valign(Gtk.Align.START);
            }
        }
    }

    _updateLabelsVisibility() {
        const labels = [
            this._lbl_tool_brush, this._lbl_tool_pencil, this._lbl_tool_highlight, this._lbl_tool_eraser,
            this._lbl_tool_bucket, this._lbl_tool_picker, this._lbl_tool_text,
            this._lbl_tool_line, this._lbl_tool_rect, this._lbl_tool_oval,
            this._lbl_tool_circle, this._lbl_tool_polygon, this._lbl_tool_freeshape,
            this._lbl_toolbar_selection, this._lbl_toolbar_paint, this._lbl_toolbar_shapes,
            this._lbl_toolbar_options, this._lbl_toolbar_thickness
        ];
        for (const lbl of labels) {
            if (lbl) {
                lbl.set_visible(this._showLabelsSetting);
            }
        }

        const tooltips = [
            { btn: this._tool_brush, text: _('Brush (B)') },
            { btn: this._tool_pencil, text: _('Pencil (P)') },
            { btn: this._tool_highlight, text: _('Highlighter') },
            { btn: this._tool_eraser, text: _('Eraser (E)') },
            { btn: this._tool_bucket, text: _('Fill (F)') },
            { btn: this._tool_picker, text: _('Color picker (C)') },
            { btn: this._tool_text, text: _('Text (T)') },
            { btn: this._tool_line, text: _('Line') },
            { btn: this._tool_rect, text: _('Rectangle') },
            { btn: this._tool_oval, text: _('Oval') },
            { btn: this._tool_circle, text: _('Circle') },
            { btn: this._tool_polygon, text: _('Polygon') },
            { btn: this._tool_freeshape, text: _('Closed freehand') }
        ];

        for (const item of tooltips) {
            if (item.btn) {
                item.btn.set_tooltip_text(this._showLabelsSetting ? null : item.text);
            }
        }

        this.connect('destroy', () => {
            if (this._styleManagerSignalId) {
                Adw.StyleManager.get_default().disconnect(this._styleManagerSignalId);
            }


            if (this._undoStack) {
                this._undoStack.forEach(s => { if (s && typeof s.destroy === 'function') s.destroy(); });
                this._undoStack = null;
            }
            if (this._redoStack) {
                this._redoStack.forEach(s => { if (s && typeof s.destroy === 'function') s.destroy(); });
                this._redoStack = null;
            }

            if (this._surface && typeof this._surface.destroy === 'function') this._surface.destroy();
            if (this._backupSurface && typeof this._backupSurface.destroy === 'function') this._backupSurface.destroy();
            if (this._selectionSurface && typeof this._selectionSurface.destroy === 'function') this._selectionSurface.destroy();
            if (this._clipboardSurface && typeof this._clipboardSurface.destroy === 'function') this._clipboardSurface.destroy();

            this._surface = null;
            this._backupSurface = null;
            this._selectionSurface = null;
            this._clipboardSurface = null;
            this._cssProvider = null;
            this._textEditorCssProvider = null;

            imports.system.gc();
        });
    }

    _showShortcutsDialog() {
        try {
            let builder = Gtk.Builder.new_from_resource('/org/fratta/gpaint/shortcuts-dialog.ui');
            let dialog = builder.get_object('shortcuts_dialog');

            dialog.connect('close-request', () => {
                dialog.destroy();
                System.gc();
                return false;
            });

            dialog.present(this);

            builder = null;
        } catch (err) {
            console.error("Error in loading keyboard shortcuts:", err);
        }
    }

    _showPreferencesWindow() {
        showPreferencesWindow(this);
    }

    _updateThicknessSliderTitle() {
        if (this._lbl_toolbar_thickness) {
            if (this._tool_rect.active) {
                this._lbl_toolbar_thickness.set_label(_("Roundness"));
            } else {
                this._lbl_toolbar_thickness.set_label(_("Thickness"));
            }
        }

        if (this._lbl_brush_size_title) {
            const adj = this._brush_size_scale.get_adjustment();

            if (this._tool_rect.active) {
                this._lbl_brush_size_title.set_label(_("Roundness"));
                adj.set_value(this._opt_rect_roundness || 1);
            } else {
                this._lbl_brush_size_title.set_label(_("Brush size"));
            }
        }
    }
});
