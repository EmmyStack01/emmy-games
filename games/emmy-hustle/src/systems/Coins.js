import gameState from '../state/GameState.js';
import { ECONOMY, FONT_FAMILY } from '../config.js';

// Simple collectible coins. They prove out the money/HUD loop now and the same
// pattern (static group + overlap) will serve for deliveries, customers, etc.
//
// `coins` is a list of { id, x, y } (see COINS in data/neighbourhood.js). A coin that
// was collected in an earlier session is not created at all, and GameState refuses to
// pay the same coin id twice.
export default class Coins {
  constructor(scene, player, coins) {
    this.scene = scene;
    this.group = scene.physics.add.staticGroup();

    coins.forEach(({ id, x, y }) => {
      if (typeof id !== 'string' || id === '') {
        console.error('[Coins] A coin has no id and was skipped:', { x, y });
        return;
      }
      if (gameState.hasCollectedCoin(id)) return;

      const coin = this.group.create(x, y, 'coin');
      coin.setData('coinId', id);
      coin.setDepth(y);
      scene.tweens.add({
        targets: coin,
        y: y - 5,
        duration: 650 + Math.random() * 300,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.inOut',
      });
    });

    scene.physics.add.overlap(player, this.group, this.collect, undefined, this);
  }

  collect(_player, coin) {
    if (!coin.active) return;
    const { x, y } = coin;

    this.scene.tweens.killTweensOf(coin);
    coin.body.enable = false;
    coin.setActive(false).setVisible(false);

    // Money and the "collected" mark change together, once per coin id. If the id
    // was somehow already collected, nothing is paid and no popup is shown.
    if (!gameState.collectCoin(coin.getData('coinId'), ECONOMY.coinValue)) return;

    const popup = this.scene.add
      .text(x, y - 10, `+\u20A6${ECONOMY.coinValue}`, {
        fontFamily: FONT_FAMILY,
        fontSize: '16px',
        fontStyle: 'bold',
        color: '#fff3b0',
        stroke: '#2b2d42',
        strokeThickness: 4,
        resolution: 2,
      })
      .setOrigin(0.5)
      .setDepth(10000);

    this.scene.tweens.add({
      targets: popup,
      y: popup.y - 34,
      alpha: 0,
      duration: 800,
      ease: 'Cubic.out',
      onComplete: () => popup.destroy(),
    });
  }
}
