# MDP Gen

Générateur de mots de passe vraiment aléatoires, en deux formes qui partagent le même cœur :

- **une extension Brave / Chrome** qui, comme Safari, propose un mot de passe robuste dès qu'un site vous en demande un nouveau, le remplit, et peut le valider avec **Touch ID** sans même vous l'afficher ;
- **un outil en ligne de commande**, `mdpgen`, sans aucune dépendance.

Rien ne part sur le réseau, aucune télémétrie. Le coffre optionnel chiffre les mots de passe avec une clé qui n'existe qu'après Touch ID. Le code est court, lisible et testé. *[English version](README.en.md).*

## Ce que fait l'extension

1. Vous cliquez dans un champ « nouveau mot de passe » (inscription, changement de mot de passe).
2. Une bulle apparaît sous le champ ; un mot de passe de 20 caractères est déjà rempli, dans le champ et dans sa confirmation.
3. Vous choisissez : **Garder celui-ci**, **Un autre**, **Ne pas utiliser**, ou **Touch ID et valider**.
4. Touch ID est demandé aussitôt, sans rien presser : une petite fenêtre attend votre empreinte, puis le formulaire est rempli et envoyé. Brave vous propose alors d'enregistrer le mot de passe dans son gestionnaire, comme pour n'importe quel mot de passe tapé à la main. Annulez et la bulle reste là, avec ses boutons ; ce déclenchement automatique se désactive dans les options.

Si vous tapez quoi que ce soit dans le champ, la proposition s'efface et vous gardez la main. Sur les formulaires de connexion, rien ne s'affiche (réglable).

Le popup de la barre d'outils génère à la demande, copie, insère dans la page, et montre le **dernier mot de passe proposé** pendant dix minutes, derrière Touch ID : un filet si Brave n'a pas proposé l'enregistrement. Cette mémoire est une mémoire de session (`chrome.storage.session`), jamais écrite sur disque, vidée à la fermeture du navigateur, et désactivable.

### Le coffre

Activez-le dans les options : deux empreintes (la clé Touch ID est recréée avec l'extension PRF de WebAuthn, puis le secret est dérivé) et une **clé de secours** de 25 caractères s'affiche une seule fois. Notez-la : c'est le seul moyen d'ouvrir le coffre si Touch ID disparaît, profil Brave réinitialisé ou nouveau Mac.

Ensuite, une inscription validée par Touch ID remplit, envoie **et enregistre** le mot de passe, avec l'identifiant du formulaire : une seule empreinte, zéro clic. Si le coffre était verrouillé au moment où un mot de passe a servi, une pastille apparaît sur l'icône et le popup propose de l'enregistrer après Touch ID. Le popup liste les entrées, les copie, les révèle ou les supprime, et verrouille. Le coffre se referme de lui-même après 15 minutes et à la fermeture du navigateur.

Techniquement : la sortie PRF de l'assertion Touch ID passe par HKDF-SHA-256 pour donner une clé qui déchiffre la clé du coffre, elle-même aléatoire et enveloppée une seconde fois par la clé de secours ; les entrées sont chiffrées en un seul bloc AES-256-GCM. Rien de lisible n'est écrit sur disque, pas même les noms des sites. Détails dans [docs/COFFRE-PRF.md](docs/COFFRE-PRF.md).

### Installation dans Brave

Depuis le Chrome Web Store dès que la fiche est publiée, ou tout de suite depuis les sources :

```bash
git clone https://github.com/Lax3n/mdpgen.git && cd mdpgen && npm install && npm run build
```

Puis dans Brave : `brave://extensions` → activer **Mode développeur** → **Charger l'extension non empaquetée** → choisir `packages/extension/dist`. Même procédure dans Chrome, Edge, Arc, Vivaldi ou Opera.

Touch ID se crée au premier usage (Brave demande votre empreinte pour créer la clé de MDP Gen), ou depuis la page d'options.

### Réglages

Longueur (4 à 128), jeux de caractères, jeu de symboles, caractères ambigus, série maximale d'identiques, bulle automatique, champs de connexion, Touch ID, validation du formulaire, durée de la mémoire de session. Tout est dans la page d'options de l'extension. Quand un site porte un attribut `passwordrules` (format Apple) ou `maxlength`, l'extension s'y conforme.

## L'outil en ligne de commande

```bash
npm install -g ./packages/cli      # après npm run build à la racine
mdpgen                              # un mot de passe de 20 caractères
mdpgen -l 32 -n 5                   # cinq de 32
mdpgen -e                           # avec l'entropie sur la sortie d'erreur
mdpgen -c                           # copié dans le presse-papiers sans l'afficher, effacé après 60 s
mdpgen --no-symbols -a              # sans symbole, sans caractère ambigu
mdpgen -r "required: upper; required: digit; maxlength: 12"
mdpgen -j                           # JSON
```

`mdpgen --help` liste toutes les options. L'effacement du presse-papiers ne touche à rien si vous avez copié autre chose entre-temps.

## Pourquoi c'est sûr

- **Source d'aléa** : `crypto.getRandomValues`, le générateur cryptographique du navigateur ou de Node. Sur Mac, il est alimenté par le générateur matériel d'Apple via le noyau. Aucune bibliothèque tierce n'intervient.
- **Pas de biais de modulo** : chaque caractère est tiré par rejet dans [0, taille de l'alphabet). Un tirage brut de 32 bits qui tombe dans la queue incomplète est rejeté, jamais replié.
- **Uniforme sur l'ensemble des mots de passe valides** : la règle « au moins un caractère de chaque jeu » et la limite de série sont appliquées par rejet du mot de passe entier, pas en forçant un caractère par classe à une position choisie. Toutes les chaînes valides sont donc équiprobables.
- **Entropie exacte** : le nombre de mots de passe valides est compté exactement (inclusion-exclusion et récurrence, en entiers de précision arbitraire) ; l'entropie affichée est son log2. Par défaut : 20 caractères sur 88 symboles, soit 129 bits.
- **Touch ID** : WebAuthn avec l'authentificateur de plateforme, l'extension étant sa propre partie utilisatrice. Chaque confirmation est une assertion dont la signature, l'origine, le défi, le RP ID et le drapeau de vérification sont contrôlés. La clé reste dans Brave, sur votre Mac.
- **Surface minimale** : une seule permission (`storage`, pour les réglages), un script de contenu dans un Shadow DOM isolé, une politique de sécurité de contenu stricte, aucun accès réseau, aucune dépendance à l'exécution.

Ce que MDP Gen ne protège pas : une page web qui lit son propre champ, puisque le mot de passe lui est destiné, et un logiciel malveillant exécuté avec vos droits pendant que le coffre est ouvert.

## Développement

```bash
npm install
npm run typecheck      # tsc -b
npm run build          # cœur, CLI, extension
npm test               # tests unitaires (vitest) : tirage, entropie, règles, CLI, coffre
npm run e2e            # Playwright, Chromium sans tête, extension chargée, Touch ID simulé
npm run e2e:brave      # pareil dans Brave, fenêtres visibles
npm run zip            # paquet pour le Chrome Web Store dans store/
```

Structure : `packages/core` (tirage, règles, entropie ; zéro dépendance), `packages/cli`, `packages/extension` (Manifest V3, TypeScript sans framework, esbuild), `e2e` (fixtures HTML et tests).

Icônes : tracés [Lucide](https://lucide.dev) (licence ISC).

## Licence

MIT.
