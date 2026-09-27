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

Offen vor Produktionsfreigabe: Netlify-Branch-Deploy, echte Anmeldung beider Rollen, vollständige Online-Abnahme und weitere Sicherheitsmaßnahmen. Ein möglicherweise erschöpftes Netlify-Creditlimit muss vor dem Online-Test behoben sein.
