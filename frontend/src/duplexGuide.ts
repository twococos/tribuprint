/**
 * Instruccions del dúplex manual.
 *
 * TODO(calibratge): comprovar amb la Canon TS3350 de debò (PDF de 3 pàgines)
 * i ajustar `flip`, `printedSide`, `topEdge` i els textos. Vegeu el README.
 * - flip: per on es gira el paquet ('long' = com una pàgina de llibre,
 *         'short' = com un bloc de notes).
 * - printedSide: com queda la cara ja impresa en tornar-lo a la safata posterior.
 * - topEdge: quina vora del text entra primer a la safata.
 */
export const DUPLEX_GUIDE = {
  flip: 'long' as 'long' | 'short',
  printedSide: 'down' as 'up' | 'down',
  topEdge: 'first' as 'first' | 'last',
  title: 'Toca girar els fulls',
  steps: [
    'Agafa tots els fulls impresos de la safata de sortida, sense desordenar-los.',
    'Gira el paquet com si passessis la pàgina d\'un llibre: la cara impresa avall.',
    'Posa\'ls a la safata posterior amb la part de dalt del text entrant primer.',
    'Prem «Continua» i la impressora farà l\'altra cara.',
  ],
}
