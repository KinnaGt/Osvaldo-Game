import Phaser from 'phaser';
import { bridge } from './bridge';
import './style.css';

class MainScene extends Phaser.Scene {
  // --- Configuración ---
  private readonly LANE_X = [200, 400, 600];
  private readonly SCREEN_HEIGHT = 600;

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
  private background!: Phaser.GameObjects.TileSprite; // NUEVO: Fondo infinito
  private player!: Phaser.GameObjects.Sprite;
  private platformGroup!: Phaser.GameObjects.Group;
  private scoreText!: Phaser.GameObjects.Text;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private currentPlatformNode: Phaser.GameObjects.Sprite | null = null;

  constructor() {
    super('MainScene');
  }

  preload() {
    // --- CARGA DE ASSETS ---
    // Asegúrate de poner las imágenes en la carpeta /public/assets/

    // // Cargar Fondo
    // this.load.image('bg_space', 'assets/background.png');

    // // Cargar Player
    // this.load.image('player_img', 'assets/player.png');

    // // Cargar Plataforma
    // this.load.image('platform_img', 'assets/platform.png');

    // Background (Estrellas)
    this.load.image('bg_space', 'https://labs.phaser.io/assets/skies/space3.png');

    // Player (Un alien verde)
    this.load.image('player_img', 'https://labs.phaser.io/assets/sprites/phaser-dude.png');

    // Platform (Una barra metálica)
    this.load.image('platform_img', 'https://labs.phaser.io/assets/sprites/platform.png');
  }

  create() {
    bridge.init();
    this.input.removeAllListeners();
    this.resetGameValues();

    // 1. FONDO INFINITO (TileSprite)
    // Se coloca en el centro (400, 300) con el tamaño total de la pantalla
    this.background = this.add.tileSprite(400, 300, 800, 600, 'bg_space');
    this.background.setDepth(-1); // Asegurar que está detrás de todo

    // 2. Crear Jugador
    this.player = this.add.sprite(this.LANE_X[1], 400, 'player_img');
    this.player.setOrigin(0.5, 1);
    this.player.setDepth(10);
    // Forzamos el tamaño visual para que coincida con la lógica (30x50)
    // Esto evita bugs si tu imagen es muy grande (ej. 500x500)
    this.player.setDisplaySize(30, 50);

    // 3. Crear Grupo
    this.platformGroup = this.add.group({
      defaultKey: null,
      maxSize: 30,
      runChildUpdate: true,
    });

    // 4. Generar Nivel
    this.initPlatforms();

    this.scoreText = this.add
      .text(20, 20, 'Score: 0', {
        fontSize: '24px',
        color: '#fff',
        stroke: '#000', // Borde negro para que se lea mejor sobre cualquier fondo
        strokeThickness: 4,
      })
      .setDepth(20);

    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys();
    }
  }

  update(_time: number, delta: number) {
    // _time soluciona el error de Vercel
    if (this.isGameOver) return;
    const dt = delta / 1000;

    // Velocidad
    const difficultyMultiplier = 1 + this.score * 0.005;
    this.gameScrollSpeed = this.BASE_SCROLL_SPEED * difficultyMultiplier;

    // --- MOVIMIENTO DEL FONDO (Parallax) ---
    // Movemos la textura del fondo para dar sensación de subir.
    // Multiplicamos por 0.5 para que el fondo se mueva más lento que las plataformas (profundidad)
    this.background.tilePositionY -= this.gameScrollSpeed * dt * 0.5;

    // Mover Plataformas
    this.platformGroup.children.each((child: any) => {
      const platform = child as Phaser.GameObjects.Sprite;
      if (platform.active) {
        platform.y += this.gameScrollSpeed * dt;
        if (platform.y > this.SCREEN_HEIGHT + 100) {
          this.respawnPlatform(platform);
        }
      }
      return true;
    });

    // Mover Jugador
    if (!this.isJumping) {
      this.player.y += this.gameScrollSpeed * dt;
      if (this.currentPlatformNode && this.currentPlatformNode.active) {
        this.player.y = this.currentPlatformNode.y;
      }
    }

    // Límites
    if (this.player.y > this.SCREEN_HEIGHT + 50) this.gameOver('¡Caíste al vacío!');
    if (this.player.y < -20) this.gameOver('¡Te aplastó el techo!');

    // Input
    if (!this.isJumping) {
      if (Phaser.Input.Keyboard.JustDown(this.cursors.left)) this.tryJump(-1);
      else if (Phaser.Input.Keyboard.JustDown(this.cursors.right)) this.tryJump(1);
    }
  }

  private tryJump(direction: number) {
    const targetLane = (this.currentLane + direction + 3) % 3;

    const isWrappingRight = this.currentLane === 2 && targetLane === 0;
    const isWrappingLeft = this.currentLane === 0 && targetLane === 2;

    const targetPlatform = this.findTargetPlatform(targetLane);

    if (targetPlatform) {
      // SALTO VÁLIDO
      this.isJumping = true;
      this.currentLane = targetLane;
      this.currentPlatformNode = targetPlatform;
      this.addScore();

      const midY = (this.player.y + targetPlatform.y) / 2 - 20;

      if (isWrappingRight) {
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
        this.tweens.add({
          targets: this.player,
          x: this.LANE_X[targetLane],
          y: targetPlatform.y,
          duration: 150,
          ease: 'Sine.easeOut',
          onUpdate: () => {
            // Pequeño efecto de "squash & stretch" al saltar
            this.player.scaleY = (50 / 50) * 1.2; // Base height 50
            this.player.scaleX = (30 / 30) * 0.8; // Base width 30
          },
          onComplete: () => this.finishJump(),
        });
      }
    } else {
      // SALTO AL VACÍO
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
    // Restaurar escala original basada en setDisplaySize
    this.player.setDisplaySize(30, 50);
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
    // Usar la imagen 'platform_img'
    const p = this.add.sprite(this.LANE_X[lane], y, 'platform_img');

    // Ajustar tamaño visual para que coincida con la hitbox lógica (100x20)
    p.setDisplaySize(100, 20);

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
  backgroundColor: '#000000', // Negro de fondo por si la imagen tarda en cargar
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
