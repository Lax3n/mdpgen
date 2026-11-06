# Sécurité

## Signaler une faille

Écrivez à l'auteur via un ticket GitHub **privé** (onglet Security → Report a vulnerability) ou un message direct ; n'ouvrez pas de ticket public pour une faille exploitable. Les corrections sont publiées avec une note dans le journal des versions.

## Modèle de menace

MDP Gen produit des mots de passe et les remet à la page qui les demande. Il ne les conserve pas.

Ce qu'il garantit :

- des tirages issus de `crypto.getRandomValues`, sans biais de modulo, uniformes sur l'ensemble des mots de passe qui respectent les contraintes ;
- une entropie annoncée exacte, calculée à partir du nombre réel de mots de passe possibles ;
- aucune écriture sur disque d'un mot de passe, aucune requête réseau, aucune télémétrie ;
- une confirmation Touch ID dont l'assertion WebAuthn est vérifiée (signature, origine, défi, RP ID, drapeau UV).

Ce qu'il ne garantit pas :

- la page web reçoit le mot de passe, c'est le but ; une page malveillante peut donc le lire, comme elle lirait ce que vous tapez ;
- la mémoire de session (dernier mot de passe proposé, dix minutes par défaut) vit dans `chrome.storage.session`, accessible aux pages de l'extension seulement ; un attaquant qui contrôle le profil du navigateur y a accès, comme à tout le reste ;
- Touch ID est une confirmation de présence et d'intention, pas un chiffrement : le mot de passe n'est pas dérivé de la clé WebAuthn.

## Choix de conception

- Surface minimale : permission `storage` seulement, pas de service web, pas de dépendance à l'exécution, politique de sécurité de contenu stricte (`default-src 'none'`).
- Script de contenu : interface dans un Shadow DOM, construction par API DOM (jamais d'`innerHTML` avec une donnée), aucune lecture des valeurs existantes des champs autres que la comparaison avec notre propre proposition.
- Messages internes : les pages de l'extension sont authentifiées par leur URL d'expéditeur avant toute action de remplissage.
- Clé Touch ID : `residentKey: discouraged`, `authenticatorAttachment: platform`, `userVerification: required` ; la clé publique est conservée pour vérifier chaque assertion.
