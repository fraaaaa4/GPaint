import Gtk from 'gi://Gtk';
import Adw from 'gi://Adw';
import Gettext from 'gettext';

const _ = Gettext.gettext;

export function showPreferencesWindow(parentWindow) {
    const prefWin = new Adw.PreferencesWindow({
        transient_for: parentWindow,
        title: _('Preferences'),
        modal: true
    });

    const page = new Adw.PreferencesPage({
        title: _('General'),
        icon_name: 'preferences-system-symbolic'
    });
    prefWin.add(page);

    // Group 1: Clear all
    const clearGroup = new Adw.PreferencesGroup({
        title: _('Clear all'),
        description: _('When I clear an image...')
    });
    page.add(clearGroup);

    const fillPrimaryRow = new Adw.ActionRow({
        title: _('Fill the canvas with the primary color')
    });
    const fillPrimaryRadio = new Gtk.CheckButton({
        active: parentWindow._pref_clear_mode === 'primary',
        valign: Gtk.Align.CENTER
    });
    fillPrimaryRow.add_prefix(fillPrimaryRadio);
    clearGroup.add(fillPrimaryRow);

    const fillSecondaryRow = new Adw.ActionRow({
        title: _('Fill the canvas with the secondary color')
    });
    const fillSecondaryRadio = new Gtk.CheckButton({
        group: fillPrimaryRadio,
        active: parentWindow._pref_clear_mode === 'secondary',
        valign: Gtk.Align.CENTER
    });
    fillSecondaryRow.add_prefix(fillSecondaryRadio);
    clearGroup.add(fillSecondaryRow);

    const fillCustomRow = new Adw.ActionRow({
        title: _('Fill the canvas with this color')
    });
    const fillCustomRadio = new Gtk.CheckButton({
        group: fillPrimaryRadio,
        active: parentWindow._pref_clear_mode === 'color',
        valign: Gtk.Align.CENTER
    });
    fillCustomRow.add_prefix(fillCustomRadio);
    const clearColorButton = new Gtk.ColorDialogButton({
        dialog: new Gtk.ColorDialog(),
        rgba: parentWindow._pref_clear_color,
        valign: Gtk.Align.CENTER,
        sensitive: parentWindow._pref_clear_mode === 'color'
    });
    fillCustomRow.add_suffix(clearColorButton);
    clearGroup.add(fillCustomRow);

    const fillTransRow = new Adw.ActionRow({
        title: _('Make the canvas transparent')
    });
    const fillTransRadio = new Gtk.CheckButton({
        group: fillPrimaryRadio,
        active: parentWindow._pref_clear_mode === 'transparent',
        valign: Gtk.Align.CENTER
    });
    fillTransRow.add_prefix(fillTransRadio);
    clearGroup.add(fillTransRow);

    // Clear all event connections
    fillPrimaryRadio.connect('toggled', () => {
        if (fillPrimaryRadio.active) {
            parentWindow._pref_clear_mode = 'primary';
            clearColorButton.set_sensitive(false);
        }
    });
    fillSecondaryRadio.connect('toggled', () => {
        if (fillSecondaryRadio.active) {
            parentWindow._pref_clear_mode = 'secondary';
            clearColorButton.set_sensitive(false);
        }
    });
    fillCustomRadio.connect('toggled', () => {
        if (fillCustomRadio.active) {
            parentWindow._pref_clear_mode = 'color';
            clearColorButton.set_sensitive(true);
        }
    });
    fillTransRadio.connect('toggled', () => {
        if (fillTransRadio.active) {
            parentWindow._pref_clear_mode = 'transparent';
            clearColorButton.set_sensitive(false);
        }
    });
    clearColorButton.connect('notify::rgba', () => {
        parentWindow._pref_clear_color = clearColorButton.rgba;
    });


    // Group 2: Saving
    const saveGroup = new Adw.PreferencesGroup({
        title: _('Saving'),
        description: _("When a transparent image is saved as JPEG or BMP, transparency isn't supported. How should that space be filled with?")
    });
    page.add(saveGroup);

    const saveColorRow = new Adw.ActionRow({
        title: _('Color')
    });
    const saveColorRadio = new Gtk.CheckButton({
        active: parentWindow._pref_save_mode === 'color',
        valign: Gtk.Align.CENTER
    });
    saveColorRow.add_prefix(saveColorRadio);
    const saveColorButton = new Gtk.ColorDialogButton({
        dialog: new Gtk.ColorDialog(),
        rgba: parentWindow._pref_save_color,
        valign: Gtk.Align.CENTER,
        sensitive: parentWindow._pref_save_mode === 'color'
    });
    saveColorRow.add_suffix(saveColorButton);
    saveGroup.add(saveColorRow);

    const saveCheckerRow = new Adw.ActionRow({
        title: _('Checkerboard pattern')
    });
    const saveCheckerRadio = new Gtk.CheckButton({
        group: saveColorRadio,
        active: parentWindow._pref_save_mode === 'checkerboard',
        valign: Gtk.Align.CENTER
    });
    saveCheckerRow.add_prefix(saveCheckerRadio);
    saveGroup.add(saveCheckerRow);

    // Saving connections
    saveColorRadio.connect('toggled', () => {
        if (saveColorRadio.active) {
            parentWindow._pref_save_mode = 'color';
            saveColorButton.set_sensitive(true);
        }
    });
    saveCheckerRadio.connect('toggled', () => {
        if (saveCheckerRadio.active) {
            parentWindow._pref_save_mode = 'checkerboard';
            saveColorButton.set_sensitive(false);
        }
    });
    saveColorButton.connect('notify::rgba', () => {
        parentWindow._pref_save_color = saveColorButton.rgba;
    });

    // Group 3: Grid
    const gridGroup = new Adw.PreferencesGroup({
        title: _('Grid'),
        description: _('Configure the drawing grid')
    });
    page.add(gridGroup);

    const gridStepRow = new Adw.ActionRow({
        title: _('Grid size (pixels)')
    });
    const gridStepAdjustment = new Gtk.Adjustment({
        lower: 2,
        upper: 100,
        value: parentWindow._pref_grid_step,
        step_increment: 1
    });
    const gridStepSpin = new Gtk.SpinButton({
        adjustment: gridStepAdjustment,
        valign: Gtk.Align.CENTER
    });
    gridStepRow.add_suffix(gridStepSpin);
    gridGroup.add(gridStepRow);

    const gridColorRow = new Adw.ActionRow({
        title: _('Grid color')
    });
    const gridColorButton = new Gtk.ColorDialogButton({
        dialog: new Gtk.ColorDialog(),
        rgba: parentWindow._pref_grid_color,
        valign: Gtk.Align.CENTER
    });
    gridColorRow.add_suffix(gridColorButton);
    gridGroup.add(gridColorRow);

    gridStepSpin.connect('value-changed', () => {
        parentWindow._pref_grid_step = gridStepSpin.get_value_as_int();
        parentWindow._saveSettings();
        parentWindow._drawing_area.queue_draw();
    });
    gridColorButton.connect('notify::rgba', () => {
        parentWindow._pref_grid_color = gridColorButton.rgba;
        parentWindow._saveSettings();
        parentWindow._drawing_area.queue_draw();
    });
    const confirmGroup = new Adw.PreferencesGroup({
        title: _('Confirmations'),
        description: _('Show or hide confirmation dialogs before doing operations')
    });
    page.add(confirmGroup);

    const clearConfirmRow = new Adw.ActionRow({
        title: _('Ask for confirmation before clearing the canvas')
    });
    const clearConfirmCheck = new Gtk.CheckButton({
        active: parentWindow._pref_clear_confirm,
        valign: Gtk.Align.CENTER
    });
    clearConfirmRow.add_prefix(clearConfirmCheck);
    confirmGroup.add(clearConfirmRow);

    clearConfirmCheck.connect('toggled', () => {
        parentWindow._pref_clear_confirm = clearConfirmCheck.active;
        parentWindow._saveSettings();
    });

    prefWin.present();
}
