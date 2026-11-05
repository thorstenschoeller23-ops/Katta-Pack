# KattaPack Zentrale – Einrichtung

Die Zentrale ist eine reine Webseite ohne eigenen Server. Login und gemeinsame Daten laufen über **Supabase**, die Webseite liegt bei **Vercel**. Beides ist im kostenlosen Tarif nutzbar.

Plan und Verträge liegen verschlüsselt in `inhalt.enc`. Lesen kann sie nur, wer angemeldet und als Mitglied eingetragen ist. Das Repository ist öffentlich, deshalb steht der Schlüssel **nicht** hier.

Dauer: ca. 20 Minuten, einmalig.

## 1. Supabase-Projekt anlegen

1. Auf supabase.com ein Konto anlegen und **New project** wählen.
2. Name z. B. `kattapack`, ein sicheres Datenbank-Passwort vergeben und als Region **Frankfurt (Central EU)** wählen. Dann bleiben die Daten in der EU.
3. Warten, bis das Projekt bereit ist (1–2 Minuten).

## 2. Datenbank einrichten

1. Links **SQL Editor** öffnen und eine neue Abfrage anlegen.
2. Den Inhalt von `supabase/setup.sql` hineinkopieren.
3. Unten bei „Mitglieder“ eure **zwei E-Mail-Adressen und Namen** eintragen.
4. Ans Ende die Zeile `insert into public.schluessel ...` setzen, die ihr gesondert bekommen habt.
5. **Run** klicken. Es muss „Success“ erscheinen.

Die Schlüssel-Zeile sicher aufbewahren, z. B. im Passwort-Manager. Ohne sie lassen sich die Inhalte nicht öffnen.

## 3. Zugänge anlegen und Registrierung sperren

1. **Authentication → Users → Add user → Create new user**: eure beiden E-Mail-Adressen, je ein Passwort, „Auto Confirm User“ anhaken.
2. Unter **Authentication → Sign In / Providers** die Einstellung **„Allow new users to sign up“ ausschalten**. Dann kann sich niemand sonst ein Konto anlegen.

Selbst wenn sich jemand registrieren könnte: Die Datenbank liefert nur Daten an E-Mail-Adressen aus der Tabelle `mitglieder`.

## 4. Supabase mit der Webseite verbinden

1. In Supabase unter **Project Settings → API** die **Project URL** und den **anon public key** (bei neueren Projekten „publishable key“) kopieren.
2. In diesem Repository die Datei `config.js` öffnen und beide Werte statt `HIER_PROJECT_URL` und `HIER_ANON_KEY` eintragen. Das geht direkt auf GitHub über das Stift-Symbol, danach „Commit changes“.

Beide Werte sind öffentlich gedacht und dürfen im Repository stehen. Geschützt wird über die Zugriffsregeln aus Schritt 2.

## 5. Bei Vercel veröffentlichen

1. Auf vercel.com **Add New → Project** wählen und das Repository `Katta-Pack` importieren.
2. Framework Preset **Other**, sonst nichts ändern, dann **Deploy**.
3. Die angezeigte Adresse öffnen, anmelden, fertig. Die Adresse dem zweiten Gesellschafter schicken.

Jede Änderung im Repository wird automatisch neu veröffentlicht.

## Im Alltag

- **Passwort vergessen:** In Supabase unter Authentication → Users beim Benutzer ein neues Passwort setzen.
- **Weitere Person:** in `mitglieder` eintragen (SQL Editor oder Table Editor) und unter Authentication einen Benutzer anlegen.
- **Daten sichern:** Im Table Editor die Tabelle `docs` als CSV exportieren. Darin stehen Häkchen, Notizen, Stammdaten und Vertragsstände.
- **Datenschutz:** Gespeichert werden nur eure eigenen Angaben (Namen, Anschriften, Konto, Notizen). Keine Daten von Endkunden eintragen. Supabase bietet einen Auftragsverarbeitungsvertrag (DPA) an, den ihr im Dashboard abschließen solltet.
