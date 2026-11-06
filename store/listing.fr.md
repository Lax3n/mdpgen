# Fiche Chrome Web Store (français)

**Nom** : MDP Gen : mots de passe robustes

**Résumé (≤ 132 caractères)** : Un mot de passe vraiment aléatoire dès qu'un site en demande un nouveau, rempli et validé avec Touch ID. Rien n'est stocké.

**Description** :

Comme Safari, mais dans Brave et Chrome. Cliquez dans un champ « nouveau mot de passe » : un mot de passe de 20 caractères (129 bits) est déjà rempli, avec sa confirmation. Gardez-le, tirez-en un autre, ou posez le doigt sur Touch ID : le formulaire est rempli et envoyé sans que le mot de passe s'affiche, et Brave vous propose de l'enregistrer.

- Source d'aléa : le générateur cryptographique du navigateur, sans biais de modulo.
- Entropie exacte affichée.
- Respecte les règles du site (passwordrules, maxlength).
- Popup : générer, copier, insérer dans la page, dernier mot de passe proposé (mémoire de session, derrière Touch ID).
- Outil en ligne de commande assorti.
- Une seule permission (réglages), aucune requête réseau, aucune télémétrie, code source public sous licence MIT.

**Catégorie** : Productivité. **Langues** : français, anglais.

**Justification des permissions** : `storage` conserve les réglages. Le script de contenu sur toutes les pages est nécessaire pour détecter les champs de mot de passe et y proposer un mot de passe ; il n'envoie rien et ne lit que le champ qu'il remplit.

**Usage des données** : aucune donnée collectée. Voir PRIVACY.md.
