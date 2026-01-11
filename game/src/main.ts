import Phaser from 'phaser';
import { bridge } from './bridge';
import './style.css';

class MainScene extends Phaser.Scene {
  // --- Configuración ---
  private readonly LANE_X = [200, 400, 600];
  private readonly SCREEN_HEIGHT = 600;

  // Ajustes de Gameplay
  private readonly BASE_SCROLL_SPEED = 180;
  private readonly PLATFORM_GAP = 120;
  private readonly JUMP_DISTANCE_LIMIT = 150;

  // --- Estado ---
  private currentLane: number = 1;
  private score: number = 0;
  private gameScrollSpeed: number = 150;
  private isGameOver: boolean = false;
  private isJumping: boolean = false;
  private lastSpawnLane: number = 1;

  // --- Referencias ---
  private player!: Phaser.GameObjects.Sprite;
  private platformGroup!: Phaser.GameObjects.Group;
  private scoreText!: Phaser.GameObjects.Text;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private currentPlatformNode: Phaser.GameObjects.Sprite | null = null;

  constructor() {
    super('MainScene');
  }

  preload() {
    if (!this.textures.exists('capsule')) {
      const graphics = this.make.graphics({ x: 0, y: 0 }, false);
      graphics.fillStyle(0xffffff);
      graphics.fillRoundedRect(0, 0, 30, 50, 15);
      graphics.generateTexture('capsule', 30, 50);
    }
    if (!this.textures.exists('platform')) {
      const pGraphics = this.make.graphics({ x: 0, y: 0 }, false);
      pGraphics.fillStyle(0x00ff00);
      pGraphics.fillRoundedRect(0, 0, 100, 20, 5);
      pGraphics.generateTexture('platform', 100, 20);
    }
  }

  create() {
    bridge.init();
    this.input.removeAllListeners();
    this.resetGameValues();

    this.player = this.add.sprite(this.LANE_X[1], 400, 'capsule');
    this.player.setOrigin(0.5, 1);
    this.player.setDepth(10);

    this.platformGroup = this.add.group({
      defaultKey: null,
      maxSize: 30,
      runChildUpdate: true,
    });

    this.initPlatforms();
    this.scoreText = this.add
      .text(20, 20, 'Score: 0', { fontSize: '24px', color: '#fff' })
      .setDepth(20);

    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys();
    }
  }

  update(_time: number, delta: number) {
    if (this.isGameOver) return;
    const dt = delta / 1000;

    // --- CORRECCIÓN CÁMARA ---
    // La velocidad SOLO depende del puntaje/tiempo.
    // Eliminada la lógica que miraba si player.y < threshold.
    const difficultyMultiplier = 1 + this.score * 0.005;
    this.gameScrollSpeed = this.BASE_SCROLL_SPEED * difficultyMultiplier;

    // Mover Plataformas (El mundo baja constantemente)
    this.platformGroup.children.each((child: any) => {
      const platform = child as Phaser.GameObjects.Sprite;
      if (platform.active) {
        platform.y += this.gameScrollSpeed * dt;

        // Reciclar plataforma
        if (platform.y > this.SCREEN_HEIGHT + 100) {
          this.respawnPlatform(platform);
        }
      }
      return true;
    });

    // Mover Jugador (Gravedad del Scroll)
    // Si no está saltando, el jugador baja solidario con el mundo (simulando que la cámara sube)
    if (!this.isJumping) {
      this.player.y += this.gameScrollSpeed * dt;

      // "Pegar" jugador a la plataforma para evitar micro-deslizamientos
      if (this.currentPlatformNode && this.currentPlatformNode.active) {
        this.player.y = this.currentPlatformNode.y;
      }
    }

    // Límites
    if (this.player.y > this.SCREEN_HEIGHT + 50) this.gameOver('¡Caíste al vacío!');
    // Opcional: Si toca el techo muy arriba, muere (o se bloquea, aquí lo matamos para dificultad)
    if (this.player.y < -20) this.gameOver('¡Te aplastó el techo!');

    // Input
    if (!this.isJumping) {
      if (Phaser.Input.Keyboard.JustDown(this.cursors.left)) this.tryJump(-1);
      else if (Phaser.Input.Keyboard.JustDown(this.cursors.right)) this.tryJump(1);
    }
  }

  private tryJump(direction: number) {
    const targetLane = (this.currentLane + direction + 3) % 3;

    // Detectar Wrap (Pac-Man)
    const isWrappingRight = this.currentLane === 2 && targetLane === 0;
    const isWrappingLeft = this.currentLane === 0 && targetLane === 2;

    const targetPlatform = this.findTargetPlatform(targetLane);

    if (targetPlatform) {
      this.isJumping = true;
      this.currentLane = targetLane;
      this.currentPlatformNode = targetPlatform;
      this.addScore();

      const midY = (this.player.y + targetPlatform.y) / 2 - 20;

      if (isWrappingRight) {
        // Wrap Derecha -> Izquierda
        this.tweens.chain({
          targets: this.player,
          tweens: [
            { x: 850, y: midY, duration: 100, ease: 'Quad.easeIn' },
            { x: -50, duration: 0 },
            {
              x: this.LANE_X[targetLane],
              y: targetPlatform.y,
              duration: 100,
              ease: 'Quad.easeOut',
            },
          ],
          onComplete: () => this.finishJump(),
        });
      } else if (isWrappingLeft) {
        // Wrap Izquierda -> Derecha
        this.tweens.chain({
          targets: this.player,
          tweens: [
            { x: -50, y: midY, duration: 100, ease: 'Quad.easeIn' },
            { x: 850, duration: 0 },
            {
              x: this.LANE_X[targetLane],
              y: targetPlatform.y,
              duration: 100,
              ease: 'Quad.easeOut',
            },
          ],
          onComplete: () => this.finishJump(),
        });
      } else {
        // Salto Normal
        this.tweens.add({
          targets: this.player,
          x: this.LANE_X[targetLane],
          y: targetPlatform.y,
          duration: 150,
          ease: 'Sine.easeOut',
          onUpdate: () => {
            this.player.scaleY = 1.2;
            this.player.scaleX = 0.8;
          },
          onComplete: () => this.finishJump(),
        });
      }
    } else {
      // Salto al vacío (Muerte)
      this.isJumping = true;
      let targetX = this.LANE_X[targetLane];
      if (isWrappingRight) targetX = 850;
      if (isWrappingLeft) targetX = -50;

      this.tweens.add({
        targets: this.player,
        x: targetX,
        y: this.player.y - 50,
        duration: 200,
        yoyo: true,
        onComplete: () => {
          this.player.y = this.SCREEN_HEIGHT + 200;
        },
      });
    }
  }

  private finishJump() {
    this.isJumping = false;
    this.player.scaleY = 1;
    this.player.scaleX = 1;
    // Asegurar snap final
    if (this.currentPlatformNode) this.player.y = this.currentPlatformNode.y;
  }

  private addScore() {
    this.score += 1;
    this.scoreText.setText(`Score: ${this.score}`);
  }

  private findTargetPlatform(laneIndex: number): Phaser.GameObjects.Sprite | null {
    let bestPlatform: Phaser.GameObjects.Sprite | null = null;
    let bestDist = Infinity;

    this.platformGroup.children.each((child: any) => {
      const p = child as Phaser.GameObjects.Sprite;
      if (p.active && Math.abs(p.x - this.LANE_X[laneIndex]) < 10) {
        if (p.y < this.player.y) {
          const dist = this.player.y - p.y;
          if (dist < this.JUMP_DISTANCE_LIMIT && dist < bestDist) {
            bestDist = dist;
            bestPlatform = p;
          }
        }
      }
      return true;
    });
    return bestPlatform;
  }

  private initPlatforms() {
    this.createPlatformAtHeight(400, 1);
    this.lastSpawnLane = 1;

    for (let i = 1; i <= 7; i++) {
      const targetY = 400 - i * this.PLATFORM_GAP;
      this.spawnProceduralPlatform(targetY);
    }
  }

  private spawnProceduralPlatform(fixedY: number) {
    let newLane;
    do {
      newLane = Phaser.Math.Between(0, 2);
    } while (newLane === this.lastSpawnLane);

    this.createPlatformAtHeight(fixedY, newLane);
    this.lastSpawnLane = newLane;
  }

  private createPlatformAtHeight(y: number, lane: number) {
    const p = this.add.sprite(this.LANE_X[lane], y, 'platform');
    this.platformGroup.add(p);

    if (y === 400 && this.currentPlatformNode === null) {
      this.currentPlatformNode = p;
    }
  }

  private respawnPlatform(platform: Phaser.GameObjects.Sprite) {
    let newLane;
    do {
      newLane = Phaser.Math.Between(0, 2);
    } while (newLane === this.lastSpawnLane);
    this.lastSpawnLane = newLane;

    let minGlobalY = Infinity;
    this.platformGroup.children.each((c: any) => {
      if (c !== platform && c.active && c.y < minGlobalY) {
        minGlobalY = c.y;
      }
      return true;
    });

    if (minGlobalY === Infinity) minGlobalY = 0;

    platform.x = this.LANE_X[newLane];
    platform.y = minGlobalY - this.PLATFORM_GAP;
    platform.setActive(true);
    platform.setVisible(true);
  }

  private resetGameValues() {
    this.score = 0;
    this.isGameOver = false;
    this.isJumping = false;
    this.currentLane = 1;
    this.lastSpawnLane = 1;
    this.currentPlatformNode = null;
  }

  private gameOver(reason: string) {
    if (this.isGameOver) return;
    this.isGameOver = true;

    this.add.rectangle(400, 300, 800, 600, 0x000000, 0.8).setDepth(100);
    this.add
      .text(400, 250, 'GAME OVER', { fontSize: '40px', color: 'red', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setDepth(101);
    this.add
      .text(400, 320, reason, { fontSize: '20px', color: '#fff' })
      .setOrigin(0.5)
      .setDepth(101);

    const btn = this.add
      .text(400, 400, 'TAP TO RESTART', {
        fontSize: '24px',
        color: '#00ff00',
        backgroundColor: '#333',
        padding: { x: 20, y: 10 },
      })
      .setOrigin(0.5)
      .setDepth(101)
      .setInteractive({ useHandCursor: true });

    this.time.delayedCall(500, () => {
      btn.on('pointerdown', () => this.scene.restart());
      this.input.once('pointerdown', () => this.scene.restart());
    });
  }
}

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  backgroundColor: '#1a1a1a',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 800,
    height: 600,
  },
  parent: 'game-container',
  physics: { default: 'arcade', arcade: { debug: false } },
  scene: [MainScene],
};

new Phaser.Game(config);
