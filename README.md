# Shreya's Schaakavontuur

Een kindvriendelijke schaak-PWA met oefeningen, achievements, virtuele prijzen en privé online kamers.

Openbare website: <https://moek72.github.io/shreyas-schaakavontuur/>

## Starten

```powershell
npm install
npm run dev
```

Open daarna het adres dat in PowerShell verschijnt.

## Firebase instellen voor online spelen

1. Maak in de Firebase Console een project en een web-app.
2. Zet **Anonymous Authentication** aan.
3. Maak een **Cloud Firestore** database.
4. Kopieer `.env.example` naar `.env` en vul de Firebase-waarden in.
5. Plaats onderstaande regels bij Firestore Rules.

```text
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /games/{gameId} {
      allow create: if request.auth != null
        && request.resource.data.hostId == request.auth.uid;
      // Een code geeft toegang tot precies één kamer; alle kamers opvragen mag niet.
      allow get: if request.auth != null;
      allow list: if false;
      allow update: if request.auth != null
        && request.resource.data.diff(resource.data).affectedKeys()
          .hasOnly(['fen', 'guestId', 'guestName', 'status', 'updatedAt'])
        && (resource.data.hostId == request.auth.uid
          || resource.data.guestId == request.auth.uid
          || (resource.data.guestId == null
            && request.resource.data.guestId == request.auth.uid
            && request.resource.data.hostId == resource.data.hostId));
      allow delete: if request.auth != null
        && resource.data.hostId == request.auth.uid;
    }
  }
}
```

Start de app na een wijziging aan `.env` opnieuw.

## Productie controleren

```powershell
npm run build
npm run preview
```

Belangrijk: de huidige voortgang en prijzen worden lokaal in de browser bewaard. Een ouderaccount en synchronisatie tussen apparaten horen bij een volgende versie.
