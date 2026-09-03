ALTER TABLE "app"."feedback" ALTER COLUMN "status" SET DEFAULT 'unreviewed';
--> statement-breakpoint
UPDATE "app"."feedback"
SET "status" = CASE "status"
	WHEN 'pending' THEN 'unreviewed'
	WHEN 'working' THEN 'reproduced'
	WHEN 'resolved' THEN 'fixed'
	ELSE "status"
END
WHERE "status" IN ('pending', 'working', 'resolved');
--> statement-breakpoint
UPDATE "app"."feedback_event"
SET "status" = CASE "status"
	WHEN 'pending' THEN 'unreviewed'
	WHEN 'working' THEN 'reproduced'
	WHEN 'resolved' THEN 'fixed'
	ELSE "status"
END
WHERE "status" IN ('pending', 'working', 'resolved');
