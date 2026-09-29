export type UiLanguage = "en" | "de";
export const LANGUAGE_STORAGE_KEY = "inspitivity-language";
export const isUiLanguage = (value: unknown): value is UiLanguage => value === "en" || value === "de";

// English is the source language. Keys are interface copy, never saved project data.
const german: Record<string, string> = {
  "Studio":"Studio","Projects":"Projekte","Settings":"Einstellungen","Workspace":"Arbeitsbereich",
  "Preferences":"Einstellungen","Metronome":"Metronom","Capture":"Aufnehmen","Create":"Erstellen",
  "Create new":"Neu erstellen","Main navigation":"Hauptnavigation","Open navigation":"Navigation öffnen",
  "Close navigation":"Navigation schließen","Expand sidebar":"Seitenleiste ausklappen",
  "Collapse sidebar":"Seitenleiste einklappen","SONGWRITING STUDIO":"SONGWRITING-STUDIO",
  "A space for your next song.":"Platz für deinen nächsten Song.",
  "Sync now":"Jetzt synchronisieren","Sign out":"Abmelden","Your studio":"Dein Studio",
  "Capture a spark. Shape a song.":"Eine Idee aufnehmen. Einen Song daraus machen.",
  "Ways to start":"So legst du los","Easy mode":"Einfacher Modus",
  "Hear two connected drafts before saving.":"Höre zwei zusammenhängende Entwürfe, bevor du speicherst.",
  "Empty project":"Leeres Projekt","Shape the song manually from a blank section.":"Gestalte den Song selbst ab einem leeren Abschnitt.",
  "Record idea":"Idee aufnehmen","Capture audio before the moment disappears.":"Nimm die Idee auf, bevor sie verfliegt.",
  "Choose the song's direction":"Wähle die Richtung des Songs",
  "Every part follows one shared musical plan.":"Alle Spuren folgen einem gemeinsamen musikalischen Plan.",
  "Sketch direction":"Richtung des Entwurfs","Mellow acoustic":"Ruhig & akustisch",
  "Quiet drums, acoustic chords and room to breathe":"Leise Drums, akustische Akkorde und viel Raum",
  "Straight rock":"Geradliniger Rock","A firm backbeat, familiar lift and singable hook":"Klarer Backbeat, vertrauter Aufbau und eingängiges Motiv",
  "Funk pocket":"Funk-Groove","Syncopated bass and drums around a lean modal vamp":"Synkopierte Bass- und Drumspur über einem reduzierten modalen Vamp",
  "wistful return":"Sehnsüchtige Rückkehr","gentle descent":"Sanfter Abstieg","open ending":"Offener Schluss",
  "warm lift":"Warmer Aufschwung","hopeful return":"Hoffnungsvolle Rückkehr","anthem lift":"Hymnischer Aufschwung",
  "back-to-one":"Zurück zum Grundton","relative-minor turn":"Moll-Wendung","modal glow":"Modales Leuchten",
  "soulful turnaround":"Soul-Wendung","soft tension":"Sanfte Spannung","tonic pocket":"Grundton-Groove",
  "modal bounce":"Modaler Schwung","call and response":"Ruf und Antwort","modal journey":"Modale Reise",
  "tension and return":"Spannung und Rückkehr","rising contrast":"Steigender Kontrast","dark pull":"Dunkler Sog",
  "dark descent":"Dunkler Abstieg","riff pedal":"Riff-Pedalton",
  "flowing six-eight":"Fließender Sechsachtel-Groove","soft pulse":"Sanfter Puls",
  "straight rock backbeat":"Gerader Rock-Backbeat","rock push":"Treibender Rock-Groove",
  "laid-back soul pocket":"Entspannter Soul-Groove","half-time soul shuffle":"Halftime-Soul-Shuffle",
  "syncopated funk":"Synkopierter Funk","open funk pocket":"Offener Funk-Groove",
  "grouped odd-meter pulse":"Gruppierter ungerader Takt","shifting accents":"Verschobene Akzente",
  "driving heavy pulse":"Treibender Heavy-Groove","half-time impact":"Halftime-Druck",
  "Soulful groove":"Soul-Groove","Syncopated pocket, warm harmony and active bass":"Synkopierter Groove, warme Harmonie und bewegter Bass",
  "Progressive motion":"Progressive Bewegung","Odd-meter accents, evolving motifs and riffs":"Ungerade Takte, entwickelte Motive und Riffs",
  "Heavy riffs":"Harte Riffs","Driven guitars, forceful drums and low bass":"Verzerrte Gitarren, druckvolle Drums und tiefer Bass",
  "Intensity":"Intensität","mellow":"ruhig","steady":"gleichmäßig","hard":"hart",
  "sparse":"sparsam","balanced":"ausgewogen","driving":"treibend","powerful":"kraftvoll",
  "Driven guitar, heavier drums and an active bass line":"Verzerrte Gitarre, härtere Drums und eine bewegte Basslinie",
  "Acoustic chords, light drums and spacious phrases":"Akustische Akkorde, leichte Drums und luftige Phrasen",
  "A balanced groove with room for contrast":"Ein ausgewogener Groove mit Raum für Kontraste",
  "Customize key, tempo and parts":"Tonart, Tempo und Spuren anpassen",
  "Key":"Tonart","Scale":"Skala","Tempo":"Tempo","Time signature":"Taktart","Time signature beats":"Taktschläge",
  "Time signature subdivision":"Taktunterteilung","Sketch key":"Tonart des Entwurfs",
  "Sketch scale":"Skala des Entwurfs","Sketch tempo":"Tempo des Entwurfs",
  "Easy mode settings":"Einstellungen des einfachen Modus",
  "Randomize key, tempo & scale":"Tonart, Tempo und Skala zufällig wählen",
  "Surprise me within this feel":"Überrasche mich in diesem Stil",
  "Melody":"Melodie","Add a lead motif":"Leitmotiv hinzufügen","Synth pattern":"Synth-Pattern",
  "Add a rhythmic counter-layer":"Rhythmische Gegenspur hinzufügen",
  "Extended form":"Erweiterte Form","Build five contrasting sections":"Fünf kontrastierende Abschnitte erstellen",
  "Hear two drafts":"Zwei Entwürfe anhören","Compare song drafts":"Songentwürfe vergleichen",
  "Choose a draft to play. Both follow your key, tempo and time signature. Save only the one you want to edit.":"Wähle einen Entwurf zum Anhören. Beide folgen deiner Tonart, deinem Tempo und deiner Taktart. Speichere nur den Entwurf, den du bearbeiten möchtest.",
  "Song draft":"Songentwurf","Selected for playback":"Zur Wiedergabe ausgewählt",
  "Select to hear":"Zum Anhören auswählen","Try two more":"Zwei weitere ausprobieren",
  "Keep this draft":"Diesen Entwurf behalten","Pick up where you left off":"Dort weitermachen, wo du aufgehört hast",
  "Recent projects":"Letzte Projekte","View all":"Alle anzeigen","New project":"Neues Projekt",
  "Recently edited ↓":"Zuletzt bearbeitet ↓","Name A–Z ↓":"Name A–Z ↓",
  "Sort projects by name":"Projekte nach Namen sortieren","Sort projects by recent edits":"Projekte nach letzter Bearbeitung sortieren",
  "Arrangement":"Arrangement","Song sections":"Songabschnitte","Add section":"Abschnitt hinzufügen",
  "Tracks":"Spuren","Drums":"Drums","Bass":"Bass","Chords":"Akkorde","Pattern":"Pattern",
  "SECTION":"ABSCHNITT","Bars":"Takte","Repeat":"Wiederholen","Feel":"Spielgefühl",
  "Meter":"Taktart","parts":"Spuren","mix":"Mix","notes":"Notizen",
  "Mix":"Mix","Notes":"Notizen","Section mix":"Abschnittsmix","Peak-safe levels":"Pegel mit Reserve",
  "Auto balance this section":"Diesen Abschnitt automatisch aussteuern",
  "Mute":"Stumm","Solo":"Solo","Recording":"Aufnahme",
  "Audition saved part":"Gespeicherte Spur anhören","Stop audition":"Anhören stoppen",
  "Remove part":"Spur entfernen","Section notes":"Abschnittsnotizen",
  "Lyrics, production or arrangement":"Text, Produktion oder Arrangement",
  "Add note":"Notiz hinzufügen","Transition":"Übergang",
  "Copy":"Kopieren","Variation":"Variation","Delete":"Löschen",
  "Song check":"Songprüfung","Ready":"Bereit","Next moves":"Nächste Schritte",
  "Repetition, contrast and the core musical layers are covered.":"Wiederholung, Kontrast und die wichtigsten musikalischen Spuren sind vorhanden.",
  "Create return":"Wiederholung erstellen","Shape energy":"Energie gestalten",
  "Project options":"Projektoptionen","Export song as multitrack MIDI":"Song als mehrspurige MIDI exportieren",
  "Rename project":"Projekt umbenennen","Share project":"Projekt teilen",
  "Delete project":"Projekt löschen","Build the next section":"Nächsten Abschnitt gestalten",
  "Section name":"Abschnittsname","Relationship":"Beziehung","Energy":"Energie",
  "Return to":"Zurück zu","Section to return to":"Abschnitt für die Wiederkehr",
  "continue":"Fortsetzen","contrast":"Kontrast","return":"Wiederkehr",
  "Draft history":"Entwurfsverlauf","Undo":"Rückgängig","Redo":"Wiederholen",
  "Draft storage full · save to a section now":"Entwurfsspeicher voll · jetzt in einem Abschnitt speichern",
  "Saved to your song · draft recovery is up to date":"Im Song gespeichert · Entwurf gesichert",
  "Unsaved to song · draft kept on this device":"Nicht im Song gespeichert · Entwurf auf diesem Gerät",
  "Part editor":"Spur bearbeiten",
  "Generate complete section":"Vollständigen Abschnitt erstellen",
  "Add empty section":"Leeren Abschnitt hinzufügen",
  "Song settings":"Songeinstellungen","Project settings":"Projekteinstellungen",
  "Project root key":"Grundton des Projekts","Project mode":"Modus des Projekts",
  "Project tempo":"Tempo des Projekts",
  "Play song or section":"Song oder Abschnitt abspielen",
  "Full song":"Ganzer Song","Sections":"Abschnitte","Full song · play once":"Ganzer Song · einmal abspielen",
  "Full song · loop":"Ganzer Song · wiederholen","Song":"Song","Section":"Abschnitt",
  "Playback options":"Wiedergabeoptionen","Count-in":"Einzählen",
  "Open metronome":"Metronom öffnen","Auto balance all tracks":"Alle Spuren automatisch aussteuern",
  "Track levels auto-balanced across the song":"Spurpegel im ganzen Song automatisch ausgeglichen",
  "Mixer":"Mixer","Playback position":"Wiedergabeposition","Stop and rewind playback":"Wiedergabe stoppen und zurücksetzen",
  "Interface density":"Oberflächendichte","Compact mode":"Kompakter Modus",
  "Smaller text, tighter menus and a shorter playback bar. Saved on this device.":"Kleinere Schrift, engere Menüs und eine kürzere Wiedergabeleiste. Auf diesem Gerät gespeichert.",
  "Appearance":"Darstellung","Theme":"Design",
  "Choose how Inspitivity looks on this device.":"Wähle das Aussehen von Inspitivity auf diesem Gerät.",
  "Black / Red / White":"Schwarz / Rot / Weiß","Focused · heavier":"Fokussiert · kräftiger",
  "Electric Green":"Elektrisches Grün","Creative · exploratory":"Kreativ · experimentell",
  "Your ideas stay yours.":"Deine Ideen bleiben deine.",
  "Projects and recordings sync privately through this site unless you explicitly add a collaborator. A device copy keeps your work available offline. Draft experiments stay on the device until you save them to a section.":"Projekte und Aufnahmen werden privat synchronisiert, außer du lädst ausdrücklich jemanden ein. Eine lokale Kopie ist offline verfügbar. Ungespeicherte Entwürfe bleiben auf diesem Gerät.",
  "Cloud sync":"Cloud-Synchronisierung","Download complete backup":"Vollständige Sicherung herunterladen",
  "Restore backup as copies":"Sicherung als Kopien wiederherstellen",
  "Includes recordings. Older project-only backups can also be imported. Restoring never replaces existing projects.":"Enthält auch Aufnahmen. Ältere Sicherungen nur mit Projekten können ebenfalls importiert werden. Bestehende Projekte werden nicht ersetzt.",
  "Phone app":"Handy-App","Installed on this device":"Auf diesem Gerät installiert",
  "Add Inspitivity to your Home Screen":"Inspitivity zum Startbildschirm hinzufügen",
  "Install on this device":"Auf diesem Gerät installieren",
  "Sound credits":"Quellen der Sounds","Credits and modifications":"Quellen und Anpassungen",
  "Sample license":"Sample-Lizenz","Account and storage":"Konto und Speicherung",
  "Inspitivity now opens full-screen and keeps your projects on this device.":"Inspitivity öffnet sich jetzt im Vollbild und speichert deine Projekte auch auf diesem Gerät.",
  "Install the app for a full-screen workspace and faster access.":"Installiere die App für einen Vollbild-Arbeitsbereich und schnelleren Zugriff.",
  "Open this page in Safari.":"Öffne diese Seite in Safari.","Tap the Share button.":"Tippe auf Teilen.",
  "Add to Home Screen":"Zum Home-Bildschirm","Add":"Hinzufügen",
  "Install app":"App installieren","Add to Home screen":"Zum Startbildschirm hinzufügen",
  "Projects and recordings are stored under your signed-in ChatGPT account and synchronized across devices. Shared projects also appear for collaborators you add by email. This device keeps a local working copy for resilience; unsaved drafts remain on this device.":"Projekte und Aufnahmen werden in deinem angemeldeten ChatGPT-Konto gespeichert und zwischen Geräten synchronisiert. Geteilte Projekte erscheinen auch bei eingeladenen Personen. Eine lokale Arbeitskopie bleibt auf diesem Gerät; ungespeicherte Entwürfe bleiben hier.",
  "Acoustic drums use Salamander and Virtuosity recordings. Rock and Progressive metal use a second sampled kit; the electronic kit uses synthesis.":"Akustische Drums nutzen Aufnahmen von Salamander und Virtuosity. Rock und Progressive Metal verwenden ein zweites Sample-Kit; das elektronische Kit wird synthetisiert.",
  "Salamander credits":"Salamander-Quellen","Virtuosity credits":"Virtuosity-Quellen",
  "Distorted electric guitar notes from FreePats, converted and trimmed for fast playback.":"Verzerrte E-Gitarren-Noten von FreePats, für schnelle Wiedergabe konvertiert und gekürzt.",
  "Your ideas, on every device":"Deine Ideen auf jedem Gerät",
  "Language":"Sprache","English":"Englisch","German":"Deutsch",
  "Choose the interface language. Saved on this device.":"Wähle die Sprache der Oberfläche. Auf diesem Gerät gespeichert.",
  "What are you making?":"Was möchtest du machen?","Project title":"Projekttitel",
  "Untitled song":"Song ohne Titel","Create project":"Projekt erstellen",
  "Quick record":"Schnellaufnahme","Catch it before it goes.":"Halte die Idee fest.",
  "Listening…":"Aufnahme läuft…","Idea name":"Name der Idee","Save to section":"In Abschnitt speichern",
  "Start recording":"Aufnahme starten","Stop & save":"Stoppen und speichern",
  "Retry saving recording":"Aufnahme erneut speichern",
  "Create something":"Etwas erstellen","Stay in the flow":"Im kreativen Fluss bleiben",
  "Drum loop":"Drum-Loop","Build a pocket":"Einen Groove bauen",
  "New progression":"Neue Akkordfolge","Find the harmony":"Harmonie finden",
  "Bass line":"Basslinie","Connect harmony and drums":"Harmonie und Drums verbinden",
  "New melody":"Neue Melodie","Shape a motif":"Ein Motiv gestalten",
  "Build a repeating guide":"Wiederkehrendes Pattern gestalten",
  "Start a song":"Einen Song beginnen",
  "Tap tempo":"Tempo tippen","Subdivision":"Unterteilung",
  "A steady pulse that stays out of the way":"Ein zuverlässiger Puls ohne Umwege",
  "Decrease tempo":"Tempo verringern","Increase tempo":"Tempo erhöhen",
  "PROJECT BPM":"PROJEKT-BPM",
  "Generate":"Erstellen","Edit Notes":"Noten bearbeiten","Edit Sound":"Sound bearbeiten",
  "Shape & sound":"Form & Sound","Customize this idea":"Diese Idee anpassen",
  "Chord Progression":"Akkordfolge","Melody Generator":"Melodie-Generator",
  "Bass Generator":"Bass-Generator","Drum Loop Generator":"Drum-Loop-Generator",
  "Riff Generator":"Riff-Generator","Synth Pattern":"Synth-Pattern",
  "Transition Designer":"Übergänge gestalten","Edit":"Bearbeiten",
  "Create a progression":"Akkordfolge erstellen","Generate chords":"Akkorde erzeugen",
  "Generate melody":"Melodie erzeugen","Generate bass":"Bass erzeugen",
  "Generate drums":"Drums erzeugen","Generate riff":"Riff erzeugen",
  "Generate pattern":"Pattern erzeugen","Regenerate":"Neu erzeugen",
  "Preview":"Vorschau","Play":"Abspielen","Pause":"Pause","Stop":"Stopp",
  "Save changes":"Änderungen speichern","Save to project":"Im Projekt speichern",
  "Export MIDI":"MIDI exportieren","Download MIDI":"MIDI herunterladen",
  "Root":"Grundton","Mode":"Modus","Mood":"Stimmung","Instrument":"Instrument",
  "Drum kit":"Drum-Kit","Strum rhythm":"Anschlagrhythmus",
  "Length":"Länge","Duration":"Dauer","Octave":"Oktave","Velocity":"Anschlagstärke",
  "Volume":"Lautstärke","Pan":"Panorama","Humanize":"Humanisieren",
  "Major":"Dur","Minor":"Moll","Ionian":"Ionisch","Aeolian":"Äolisch",
  "ionian":"ionisch","aeolian":"äolisch","dorian":"dorisch","phrygian":"phrygisch",
  "lydian":"lydisch","mixolydian":"mixolydisch","locrian":"lokrisch",
  "Chord progression":"Akkordfolge",
  "Save idea":"Idee speichern","New idea":"Neue Idee","Saved ideas":"Gespeicherte Ideen",
  "Choose a section":"Abschnitt wählen","Create a section":"Abschnitt erstellen",
  "New section":"Neuer Abschnitt","Section length":"Abschnittslänge",
  "Song transport":"Song-Wiedergabe","Project music settings":"Musikalische Projekteinstellungen",
  "Where should this idea go?":"Wohin soll diese Idee?",
  "Destination project":"Zielprojekt","Destination section":"Zielabschnitt",
  "Save":"Speichern","Cancel":"Abbrechen","Close":"Schließen","Back":"Zurück",
};

export function translateUi(source: string, language: UiLanguage): string {
  if (language === "en") return source;
  const match = source.match(/^(\s*)([\s\S]*?)(\s*)$/);
  if (!match) return source;
  const [, before, key, after] = match;
  const translated = german[key]
    ?? (key.match(/^Draft (\d+)$/)?.[1] ? `Entwurf ${key.slice(6)}` : undefined)
    ?? (key.match(/^(\d+) bars$/)?.[1] ? `${key.split(" ")[0]} Takte` : undefined)
    ?? (key.match(/^(\d+) sections$/)?.[1] ? `${key.split(" ")[0]} Abschnitte` : undefined)
    ?? (key.match(/^(\d+(?:\.\d+)?) beats · one bar$/)?.[1] ? `${key.split(" ")[0]} Schläge · ein Takt` : undefined)
    ?? (key.match(/^(\d+(?:\.\d+)?) beats?$/)?.[1] ? `${key.split(" ")[0]} ${key.startsWith("1 ") ? "Schlag" : "Schläge"}` : undefined)
    ?? (key.match(/^(.+) · play once$/)?.[1] ? `${key.slice(0,-12)} · einmal abspielen` : undefined)
    ?? (key.match(/^(.+) · loop$/)?.[1] ? `${key.slice(0,-7)} · wiederholen` : undefined);
  return before + (translated ?? key) + after;
}

const textSources = new WeakMap<Text, { source: string; rendered: string }>();
const attributeSources = new WeakMap<Element, Map<string, { source: string; rendered: string }>>();
const LOCALIZED_ATTRIBUTES = ["aria-label", "title", "placeholder"];

function localizeText(node: Text, language: UiLanguage) {
  const current = node.nodeValue ?? "";
  const previous = textSources.get(node);
  const source = previous && current === previous.rendered ? previous.source : current;
  const rendered = translateUi(source, language);
  textSources.set(node, { source, rendered });
  if (current !== rendered) {
    // Native option values must remain stable when their visible label changes.
    const option = node.parentElement?.closest("option");
    if (option && !option.hasAttribute("value")) option.setAttribute("value", option.value);
    node.nodeValue = rendered;
  }
}

function localizeElement(element: Element, language: UiLanguage) {
  const attributes = attributeSources.get(element) ?? new Map<string, { source: string; rendered: string }>();
  for (const name of LOCALIZED_ATTRIBUTES) {
    const current = element.getAttribute(name);
    if (current === null) continue;
    const previous = attributes.get(name);
    const source = previous && current === previous.rendered ? previous.source : current;
    const rendered = translateUi(source, language);
    attributes.set(name, { source, rendered });
    if (current !== rendered) element.setAttribute(name, rendered);
  }
  attributeSources.set(element, attributes);
}

function localizeBranch(node: Node, language: UiLanguage) {
  if (node.nodeType === Node.TEXT_NODE) { localizeText(node as Text, language); return; }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const element = node as Element;
  if (element.closest("[data-no-translate], textarea, script, style, code")) return;
  localizeElement(element, language);
  for (const child of element.childNodes) localizeBranch(child, language);
}

export function observeUiLanguage(root: Element, language: UiLanguage): () => void {
  localizeBranch(root, language);
  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      if (mutation.type === "characterData") localizeBranch(mutation.target, language);
      else if (mutation.type === "attributes") localizeElement(mutation.target as Element, language);
      else for (const child of mutation.addedNodes) localizeBranch(child, language);
    }
  });
  observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: LOCALIZED_ATTRIBUTES });
  return () => observer.disconnect();
}
