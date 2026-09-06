CREATE TABLE "app"."release_note" (
	"id" text PRIMARY KEY NOT NULL,
	"environment" text NOT NULL,
	"version" text NOT NULL,
	"draft" jsonb NOT NULL,
	"published" jsonb,
	"revision" integer DEFAULT 1 NOT NULL,
	"first_published_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" text,
	"updated_by_user_id" text,
	CONSTRAINT "release_note_environment_check" CHECK ("app"."release_note"."environment" IN ('production', 'development', 'local')),
	CONSTRAINT "release_note_revision_check" CHECK ("app"."release_note"."revision" > 0),
	CONSTRAINT "release_note_version_check" CHECK ("app"."release_note"."draft"->>'version' = "app"."release_note"."version" AND ("app"."release_note"."published" IS NULL OR "app"."release_note"."published"->>'version' = "app"."release_note"."version"))
);
--> statement-breakpoint
ALTER TABLE "app"."release_note" ADD CONSTRAINT "release_note_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."release_note" ADD CONSTRAINT "release_note_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "release_note_environment_version_uidx" ON "app"."release_note" USING btree ("environment","version");--> statement-breakpoint
CREATE INDEX "release_note_environment_published_idx" ON "app"."release_note" USING btree ("environment","published_at");

--> statement-breakpoint
-- Bootstrap the already-published history once. Future edits belong in /admin/changelog.
INSERT INTO "app"."release_note"
  (id, environment, version, draft, published, first_published_at, published_at)
SELECT 'release-seed-' || env.environment || '-' || (note->>'version'),
  env.environment, note->>'version', note, note, now(), now()
FROM (VALUES ('production'), ('development'), ('local')) AS env(environment)
CROSS JOIN jsonb_array_elements($release_seed$[
  {
    "version": "0.6.1",
    "date": "2026-09-05",
    "title": {
      "zh": "更新日志与版本通知上线",
      "en": "Changelog and release notifications"
    },
    "sections": [
      {
        "kind": "added",
        "items": [
          {
            "zh": "从侧边栏进入「更新日志」，集中查看已发布版本的新功能、体验优化与问题修复，支持中英文切换。",
            "en": "Open Changelog from the sidebar to review published features, improvements and fixes in Chinese or English."
          },
          {
            "zh": "首次访问或版本升级后，在工作台就绪且没有其他弹窗时显示本次更新；关闭或查看日志后不会重复打扰。",
            "en": "After a first visit or version upgrade, the update appears once the workbench is ready and no other dialog is open, then stays dismissed after reading."
          },
          {
            "zh": "管理员可在后台创建草稿，预览日志页和弹窗，再发布、撤回或关闭该版本的弹窗通知。",
            "en": "Administrators can draft and preview page or dialog content, then publish, withdraw or disable its announcement."
          }
        ]
      },
      {
        "kind": "improved",
        "items": [
          {
            "zh": "更新日志按正式、开发和本地环境隔离；草稿与已发布内容分开保存，编辑草稿不会提前改变用户看到的内容。",
            "en": "Release notes are isolated by production, development and local environments, while drafts remain separate from public snapshots until publication."
          },
          {
            "zh": "已读状态会在同一环境的标签页间同步；同版本文字修正、重新部署或版本回退不会再次弹窗。",
            "en": "Read state syncs across tabs in the same environment, while same-version edits, redeployments and rollbacks do not repeat the announcement."
          }
        ]
      }
    ],
    "notify": true
  },
  {
    "version": "0.6.0",
    "date": "2026-09-05",
    "title": {
      "zh": "专精规划上线",
      "en": "Meet the Mastery Planner"
    },
    "sections": [
      {
        "kind": "added",
        "items": [
          {
            "zh": "从侧边栏进入「专精规划」，选择自己 Box 中已拥有的精二干员，支持搜索、星级和职业筛选。",
            "en": "Open Mastery Planner from the sidebar and choose an owned Elite 2 operator from your Box, with search, rarity and class filters."
          },
          {
            "zh": "对比「省操作」与「极速」方案，查看各阶段的训练员、换人时机和预计用时。",
            "en": "Compare low-interaction and fastest plans, with trainers, handoff times and estimated durations for every stage."
          },
          {
            "zh": "查看训练员已解锁的基建技能，一键复制操作清单；计算在本地完成，不修改 Box，也不占用排班求解队列。",
            "en": "Inspect unlocked trainer skills and copy the checklist. Planning runs locally without changing your Box or using the scheduling queue."
          }
        ]
      },
      {
        "kind": "improved",
        "items": [
          {
            "zh": "专精选人复用手动选干员的筛选组件；技能详情按需加载。修改输入后，旧方案会提示重新计算。",
            "en": "Mastery selection reuses the operator filters, skill details load on demand, and changing inputs prompts you to recalculate."
          }
        ]
      }
    ],
    "notify": false
  },
  {
    "version": "0.5.1",
    "date": "2026-09-05",
    "title": {
      "zh": "调整练度与手动修改，入口更清楚",
      "en": "Clearer progression and manual-edit workflows"
    },
    "sections": [
      {
        "kind": "improved",
        "items": [
          {
            "zh": "明确区分「修改练度并重新计算」与「手动修改排班」：前者修改计算输入，后者基于结果创建手动草稿。手动排班在正式站仍为待开发。",
            "en": "Progression changes update calculation inputs; manual editing creates a draft from the result. Manual Scheduling remains under development on the production site."
          },
          {
            "zh": "排班设置与调整练度共用星级、职业和班次筛选；「全选最高精英」关闭时恢复开启前的 Box。",
            "en": "Settings and progression editing share rarity, class and shift filters. Turning off max elite restores your previous Box."
          },
          {
            "zh": "手动排班统一布局、班次和换心情控件；替换已有草稿前会再次确认。",
            "en": "Manual Scheduling shares layout, shift and morale controls, and asks before replacing a saved draft."
          }
        ]
      }
    ],
    "notify": false
  },
  {
    "version": "0.5.0",
    "date": "2026-09-05",
    "title": {
      "zh": "基建技能补充说明",
      "en": "Infrastructure skill clarifications"
    },
    "sections": [
      {
        "kind": "added",
        "items": [
          {
            "zh": "技能查询中可查看已发布的补充说明，直接显示在对应干员的技能卡片上。",
            "en": "Published clarifications appear directly on the corresponding operator skill cards in Skill Search."
          }
        ]
      },
      {
        "kind": "improved",
        "items": [
          {
            "zh": "人工说明与自动同步的游戏资源分开保存，资源更新不会覆盖补充说明。",
            "en": "Editorial notes are stored separately from game assets so automatic resource updates cannot overwrite them."
          }
        ]
      }
    ],
    "notify": false
  },
  {
    "version": "0.4.9",
    "date": "2026-09-04",
    "title": {
      "zh": "手动排班分环境开放",
      "en": "Manual Scheduling availability"
    },
    "sections": [
      {
        "kind": "improved",
        "items": [
          {
            "zh": "正式站的手动排班页显示「待开发」，开发环境保留完整编辑器供测试。",
            "en": "Production shows an under-development page; development keeps the complete editor available for testing."
          }
        ]
      },
      {
        "kind": "fixed",
        "items": [
          {
            "zh": "统一手动排班页面的缓存策略，避免更新后沿用旧环境的页面。",
            "en": "Updated the page cache policy to prevent stale deployment-specific content after a release."
          }
        ]
      }
    ],
    "notify": false
  },
  {
    "version": "0.4.8",
    "date": "2026-09-04",
    "title": {
      "zh": "布局切换与排班体验修复",
      "en": "Layout and scheduling improvements"
    },
    "sections": [
      {
        "kind": "fixed",
        "items": [
          {
            "zh": "修复切换基建布局后仍按旧布局计算、需要刷新才能生效的问题。",
            "en": "Fixed calculations using the old base layout after a layout change until the page was refreshed."
          },
          {
            "zh": "一图流加载改为每个基建房间独立的骨架屏，移除整块基建从上向下进入的动画。",
            "en": "The overview now uses a skeleton for each room instead of moving the entire base down on load."
          }
        ]
      },
      {
        "kind": "improved",
        "items": [
          {
            "zh": "练度调整与手动排班统一登录校验；手动草稿支持保存、多班次配置和 MAA 导出。",
            "en": "Progression and manual scheduling share sign-in checks; manual drafts support persistence, multiple shifts and MAA export."
          }
        ]
      }
    ],
    "notify": false
  },
  {
    "version": "0.4.7",
    "date": "2026-09-04",
    "title": {
      "zh": "干员与基建技能资源更新",
      "en": "Operator and infrastructure data refresh"
    },
    "sections": [
      {
        "kind": "fixed",
        "items": [
          {
            "zh": "补齐结城理、埃癸斯、岳羽由加莉、虎狼丸等干员及其基建技能、头像与图标。",
            "en": "Updated operators, skills, portraits and icons, including Makoto Yuki, Aigis, Yukari Takeba and Koromaru."
          }
        ]
      }
    ],
    "notify": false
  }
]$release_seed$::jsonb) AS note
ON CONFLICT (environment, version) DO NOTHING;
