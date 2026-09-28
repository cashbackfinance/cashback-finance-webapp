# Cashback Finance Web App

Repository für die Entwicklung und Bereitstellung der Cashback-Finance-Web-App.

## Deployment

- `main`: funktional freigegebener Produktionsstand. Push/Merge löst einen bewussten Production-Deploy aus und benötigt die funktionale Freigabe.
- `development`: Arbeits- und Teststand; zuerst über den Netlify-Branch-Deploy prüfen.
- Änderungen bündeln. ZIP/Drag-and-drop bleibt ausschließlich Fallback.
- Keine `.env`, Service-Role-Keys, Backend-Secrets oder privaten Schlüssel committen. Der Supabase Publishable Key im Frontend ist zulässig.

## Entwicklungsstand V1.4 – noch keine Produktionsfreigabe

Auf Basis des unveränderten V1.3-Bundles ergänzt:

- Customer kann eine begründete Sparzieländerung anfragen. Bestehende Ziele bleiben gesperrt.
- Advisor nimmt die geprüfte Änderung an oder lehnt sie mit Begründung ab.
- Backend speichert Entscheider und Vorher-/Nachher-Stand, schließt den Vorgang atomar und verhindert Mehrfachbearbeitung.
- Offene Zielerreichungsmeldungen blockieren die Annahme. Verifizierte Ziele bleiben gesperrt. Zieländerungen erzeugen keinen Progress.

Die freigegebene Migration `add_controlled_savings_goal_changes` ist bereits im gemeinsamen Supabase-Projekt angewendet. Ein Branch-Deploy trennt das Frontend, erzeugt aber keine separate Datenbank. Online-Tests dürfen deshalb keine echten fachlichen Bestätigungen nur zu Testzwecken erzeugen.

Prüfstand: Syntax und 27 Frontend-Prüfungen erfolgreich. Backend-Abläufe mit Customer-/Advisor-Rollen sowie die bestehende Zielerreichung getestet; sämtliche Testdaten zurückgerollt. Lokale Browser-Prüfung mit gekennzeichneten simulierten Antworten erfolgreich.

## Ergänzung V1.4.1 – Fensterwechsel

Die Rückkehr zum Browserfenster ersetzt die laufende Ansicht nicht mehr automatisch. Der Aktualisieren-Button zeigt stattdessen „Daten auf Aktualität prüfen“. Erst ein bewusster Klick lädt neu. Dadurch bleiben Klickziele und ungesendete Formulare beim Fensterwechsel erhalten. Fachliche Aktionen laden ihre Ergebnisse weiterhin neu aus dem Core.

Syntaxprüfung und 30 Frontend-Prüfungen bestanden, einschließlich Fensterwechsel ohne zusätzliche Datenanfrage, Erhalt eines Formularentwurfs und expliziter Aktualisierung.

Der V1.4-Branch-Deploy und echte Anmeldung beider Rollen wurden geprüft. Der Online-Ablauf einer ausdrücklich synthetischen Sparzieländerung ist vollständig geprüft: Customer-Anfrage, Advisor-Inbox, dokumentierte Ablehnung, geschlossener Vorgang, Customer-Rückmeldung. Ziel und Progress bleiben unverändert. Das separat freigegebene Security-Backend-Paket ist umgesetzt.

Offen vor Produktionsfreigabe: weitere fachliche Online-Abnahmen, tatsächliche Paralleltests und vollständige Sicherheitsabnahme. Die erfolgreiche Ablehnung eines Testantrags ist keine Abnahme aller Entscheidungswege. V1.4.1 muss nach dem Branch-Deploy online geprüft werden.

## Ergänzung V1.4.2 – Advisor-Jahresprüfstatus

Die freigegebene Migration add_advisor_financial_area_year_status ergänzt reviewed_this_year in der bestehenden Advisor-Kundenübersicht. Sie verwendet dieselbe serverseitige Definition wie die Customer-Finanzlandkarte. Die Advisor-Anzeige trennt den Jahresprüfstatus vom gespeicherten Bearbeitungsstatus. Fehlende historische Prüfdaten bleiben als nicht hinterlegt sichtbar.

Syntax und 31 Frontend-Prüfungen bestanden. Backend-Abnahme mit ROLLBACK: Gleichheit mit Customer-View, Zugriffssperre für Customer/anonym, Grenzen für Jahr, Verifikation, Person und Finanzbereich. Keine neuen Progress-Ereignisse und keine historische Datenkorrektur. Online-Advisor-Abnahme des Branch-Deploys steht noch aus.
