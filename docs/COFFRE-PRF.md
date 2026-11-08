# Étude : un coffre local protégé par Touch ID (WebAuthn PRF)

*08 novembre 2026. État : phase 1 réalisée le jour même (coffre, clé de secours, enregistrement automatique, vue dans le popup). Phases 2 et 3 à venir.*

## Ce qu'on veut

1. **Enregistrement automatique.** Après une inscription validée par Touch ID, le mot de passe est conservé sans aucun clic supplémentaire.
2. **Connexion automatique.** Sur une page de connexion déjà connue, Touch ID remplit l'identifiant et le mot de passe, puis clique « Se connecter ».

## Pourquoi ce n'est pas possible aujourd'hui

- Aucune API d'extension ne permet d'écrire dans le gestionnaire de mots de passe de Brave. Sa bulle « Enregistrer le mot de passe » apparaît après l'envoi du formulaire et demande un clic ; une extension ne peut ni la déclencher ni la valider.
- MDP Gen ne conserve rien (décision du 6 novembre) : il n'a donc rien à remplir sur une page de connexion.

La seule voie est que MDP Gen garde lui-même les mots de passe, dans un coffre chiffré dont la clé n'existe qu'après Touch ID.

## Faisabilité mesurée le 8 novembre

L'extension PRF de WebAuthn (*pseudo-random function*) demande à l'authentificateur de calculer, lors d'une assertion, une sortie de 32 octets dérivée d'un secret interne à la clé et d'un sel fourni. Cette sortie est stable pour une même clé et un même sel, et n'existe qu'après la vérification de l'utilisateur. C'est le mécanisme qu'utilisent les gestionnaires qui se déverrouillent par passkey.

| Vérification | Chromium (Playwright) | Brave 156 |
| --- | --- | --- |
| `getClientCapabilities()` → `extension:prf` | vrai | vrai |
| Création d'une clé plateforme depuis `chrome-extension://…` avec `prf: {}` | `enabled: true` | `enabled: true` |
| Assertion avec `prf.eval.first` | 32 octets | 32 octets |
| Deux assertions, même sel | sortie identique | sortie identique |
| Vrai capteur Touch ID | sans objet | `enabled: true`, 2 × 32 octets identiques |

Les lignes « Chromium » et « Brave » utilisent un authentificateur virtuel (`WebAuthn.addVirtualAuthenticator` avec `hasPrf`), qui valide le câblage de l'API depuis l'origine d'une extension. La dernière ligne est la seule qui dépende du matériel.

**Vrai Touch ID dans Brave : confirmé.** Le 8 novembre, sur le Mac d'Alexandre, Brave 156 avec un profil vierge : la clé plateforme s'est créée avec `prf.enabled: true`, et deux assertions successives au capteur ont rendu la même sortie de 32 octets. La chaîne Touch ID → PRF → clé de chiffrement est donc disponible, sans composant natif.

## Architecture proposée

### Clés

```
clé WebAuthn (Touch ID, Brave, avec PRF)
        │  assertion + sel S (32 octets aléatoires, stocké en clair)
        ▼
sortie PRF (32 octets)
        │  HKDF-SHA-256, info « mdpgen/vault/kek/v1 »
        ▼
KEK (AES-256-GCM)  ──déchiffre──▶  VK, clé du coffre (AES-256-GCM, aléatoire)
                                        │
clé de secours (25 caractères, 125 bits) │
        │  HKDF-SHA-256, sel dédié       │
        ▼                               │
KEK de secours  ──déchiffre──▶  la même VK
```

- La clé WebAuthn actuelle de MDP Gen n'a pas été créée avec PRF ; l'activation du coffre la recrée (une empreinte).
- La clé du coffre `VK` est enveloppée deux fois : par la clé dérivée de Touch ID, et par une clé dérivée d'une **clé de secours** de 25 caractères (alphabet de Crockford, 125 bits, tirée uniformément par le cœur de MDP Gen) générée une seule fois et montrée à l'utilisateur pour qu'il la note. Sans elle, un profil Brave réinitialisé, un nouveau Mac ou une clé WebAuthn supprimée rendent le coffre définitivement illisible. Elle est obligatoire. *Choix de réalisation : une clé aléatoire plutôt que six mots, ce qui évite d'embarquer une liste de mots et, l'entropie étant déjà de 125 bits, rend l'étirement de clé inutile ; HKDF suffit.*
- `VK` déchiffrée ne vit qu'en mémoire (`chrome.storage.session`, jamais sur disque) et s'efface après un délai réglable, 15 minutes par défaut, et à la fermeture du navigateur.
- Tout est dans WebCrypto : aucune dépendance. Le module `vault.ts` ne touche au navigateur qu'à travers deux stockages injectés, ce qui permet de le tester sous Node (11 tests : création, enveloppes, clé de secours mal tapée, expiration, altération détectée, rien en clair sur disque).

### Données

Un seul blob chiffré dans `chrome.storage.local` :

```
vault = {
  version: 1,
  prfSalt, kdfSalt,                 // en clair
  wrappedByPrf, wrappedByRecovery,  // VK enveloppée, AES-GCM
  credentialId,                     // la clé WebAuthn du coffre
  entries: { iv, ciphertext }       // AES-256-GCM(VK) du JSON des entrées
}
entrée = { id, host, origin, username, password, note?, createdAt, updatedAt, lastUsedAt }
```

Chiffrer la liste entière, et non chaque entrée, évite de laisser les noms d'hôtes en clair au repos : rien ne révèle sur quels sites on a un compte.

### Flux

1. **Inscription avec Touch ID** (déjà en place) : l'assertion qui autorise le remplissage porte aussi l'évaluation PRF. Une seule empreinte remplit, valide et **enregistre** : identifiant détecté dans le formulaire (champ email ou nom d'utilisateur), mot de passe, hôte. Zéro clic.
2. **Inscription par « Garder celui-ci »** sans Touch ID : à l'envoi du formulaire, une bulle « Enregistrer dans MDP Gen ? Touch ID » ; refus possible.
3. **Connexion** : un champ mot de passe sur un formulaire de connexion, pour un hôte connu du coffre, déclenche Touch ID (automatiquement, comme aujourd'hui pour les inscriptions, ou sur bouton selon le réglage). L'assertion déverrouille le coffre, l'identifiant et le mot de passe sont remplis, puis le bouton « Se connecter » est cliqué. Plusieurs comptes pour un hôte : la bulle les liste avant Touch ID.
4. **Changement de mot de passe** : formulaire avec ancien et nouveau mot de passe, l'entrée est mise à jour après validation.
5. **Popup** : vue « Coffre » verrouillée par défaut, recherche, copie derrière Touch ID, suppression, export et import d'un fichier chiffré `.mdpgen` (même format que le blob).

### Ce qui change dans l'extension

- Permissions : inchangées, `storage` suffit. Toujours aucune requête réseau.
- Nouveau module `vault` (clés, chiffrement, entrées), nouvelle vue dans le popup, détection de l'identifiant et des formulaires de connexion dans le script de contenu, migration de la clé WebAuthn vers PRF.
- Les tests de bout en bout gardent l'authentificateur virtuel, qui sait faire PRF (`hasPrf`). Limite mesurée : un authentificateur virtuel est propre à chaque page et `WebAuthn.addCredential` ne transporte pas le secret PRF ; une clé recopiée vers une autre page rend donc une autre sortie PRF. La chaîne « une seule empreinte remplit, valide et enregistre » n'est testable que sur le vrai capteur ; les tests couvrent la création, le verrou, la clé de secours, le relien de Touch ID, l'enregistrement en attente et le repli quand la clé diffère.
- Brave continuera de proposer sa propre bulle d'enregistrement ; on conseillera de la désactiver dans ses réglages pour ne pas avoir deux gestionnaires.

### Sécurité

Couvert :

- Vol du disque, copie du profil, autre extension : seul le texte chiffré est lisible ; la clé n'est jamais écrite et n'est dérivable qu'avec le secret que l'authentificateur libère après Touch ID. C'est ici que le matériel du Mac compte vraiment : le secret PRF ne sort de l'authentificateur qu'après vérification biométrique.
- Page web : elle ne voit que ce que MDP Gen remplit dans ses propres champs.
- Intégrité : AES-GCM détecte toute altération du coffre.

Non couvert, et il faut le dire :

- Un logiciel malveillant exécuté avec les droits de l'utilisateur pendant que le coffre est déverrouillé, ou un Brave compromis, lit la mémoire comme le ferait l'extension.
- Rien n'empêche l'utilisateur d'ignorer la phrase de secours ; la perdre équivaut à perdre le coffre.
- Sans synchronisation, le coffre est propre à un profil Brave sur un Mac. Une synchronisation par fichier chiffré sur iCloud Drive est envisageable ensuite, le format s'y prête.

### Effort estimé

| Phase | Contenu | Durée |
| --- | --- | --- |
| 1 | Coffre, clé PRF, clé de secours, enregistrement automatique à l'inscription, vue Coffre dans le popup | **fait** |
| 2 | Connexion automatique : formulaires de connexion, multi-comptes, clic sur le bouton, mise à jour au changement de mot de passe | 1,5 jour |
| 3 | Export et import, verrouillage automatique, tests de bout en bout avec PRF virtuel, documentation | 1 jour |

## Décisions à prendre

1. ~~**Faire le coffre, oui ou non.**~~ Décidé le 8 novembre : oui, phase 1 réalisée.
2. **Connexion automatique** : Touch ID et clic « Se connecter » dès l'arrivée sur la page de connexion, ou seulement sur un bouton de la bulle.
3. **Bulle d'enregistrement de Brave** : la laisser en doublon ou recommander de la couper.
4. **Phrase de secours obligatoire** à l'activation, recommandé.
