"use client";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableCaption,
} from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePaginatedQuery, useQuery } from "convex/react";
import {
  AlertTriangle,
  ArrowUpRight,
  CarFront,
  CheckCircle2,
  Plus,
  ShieldAlert,
} from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useI18n } from "@/i18n/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WorkspaceLoading } from "@/components/workspace-loading";
import { localizedLabel } from "@/lib/fleet";
export function FleetList({
  agencyId,
  canCreate,
}: {
  agencyId: Id<"agencies">;
  canCreate: boolean;
}) {
  const {
    locale,
    messages: { fleet: m, operations: o },
  } = useI18n();
  const [lifecycle, setLifecycle] = useState<"active" | "archived">("active");
  const [branch, setBranch] = useState("");
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [exact, setExact] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setTerm(search), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const branches = useQuery(api.fleet.options, { agencyId });
  const catalogs = useQuery(api.fleetCatalogs.list, { agencyId });
  const { results, status, loadMore } = usePaginatedQuery(
    api.fleet.list,
    {
      agencyId,
      lifecycle,
      branchId: branch ? (branch as Id<"branches">) : undefined,
      categoryId: category ? (category as Id<"fleetCatalogs">) : undefined,
      search: term,
      exact,
    },
    { initialNumItems: 20 },
  );
  return (
    <div className="fleet-stack">
      <div className="settings-section-topline">
        <div className="fleet-tabs" role="group" aria-label={m.filter}>
          {(["active", "archived"] as const).map((s) => (
            <Button
              key={s}
              variant={s === lifecycle ? "secondary" : "ghost"}
              aria-pressed={s === lifecycle}
              onClick={() => setLifecycle(s)}
            >
              {m[s]}
            </Button>
          ))}
        </div>
        {canCreate && (
          <Button asChild className="rounded-full min-h-11">
            <Link href={`/app/${agencyId}/fleet/new`}>
              <Plus className="size-4" aria-hidden />
              {m.add}
            </Link>
          </Button>
        )}
      </div>
      <div className="fleet-filters">
        <div className="fleet-field fleet-search">
          <Label htmlFor="fleet-search">{m.search}</Label>
          <Input
            id="fleet-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={m.searchHint}
            maxLength={100}
          />
        </div>
        <div className="fleet-field">
          <Label htmlFor="fleet-branch">{m.branchId}</Label>
          <Select
            value={branch || "all"}
            onValueChange={(value) => setBranch(value === "all" ? "" : value)}
            dir={locale === "ar" ? "rtl" : "ltr"}
          >
            <SelectTrigger
              id="fleet-branch"
              className="w-full min-w-0 min-h-11 shadow-none"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectItem className="min-h-11" value="all">
                {m.allBranches}
              </SelectItem>
              {branches?.map((b) => (
                <SelectItem className="min-h-11" key={b.id} value={b.id}>
                  {b.name}
                  {b.status === "archived" ? ` (${m.archived})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="fleet-field">
          <Label htmlFor="fleet-category">{m.categoryId}</Label>
          <Select
            value={category || "all"}
            onValueChange={(value) => setCategory(value === "all" ? "" : value)}
            dir={locale === "ar" ? "rtl" : "ltr"}
          >
            <SelectTrigger
              id="fleet-category"
              className="w-full min-w-0 min-h-11 shadow-none"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectItem className="min-h-11" value="all">
                {m.allCategories}
              </SelectItem>
              {catalogs
                ?.filter((c) => c.kind === "category")
                .map((c) => (
                  <SelectItem className="min-h-11" key={c.id} value={c.id}>
                    {localizedLabel(c.labels, locale)}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <Label htmlFor="fleet-exact" className="fleet-checkbox fleet-exact">
          <Checkbox
            id="fleet-exact"
            checked={exact}
            onCheckedChange={(checked) => setExact(checked === true)}
          />
          {m.exact}
        </Label>
      </div>
      {status === "LoadingFirstPage" ? (
        <WorkspaceLoading label={m.loading} variant="card" />
      ) : results.length === 0 ? (
        <div className="fleet-empty">
          <CarFront className="size-10 text-primary" aria-hidden />
          <h2>
            {search || branch || category || lifecycle === "archived"
              ? m.noResults
              : m.empty}
          </h2>
          <p>{m.emptyHint}</p>
          {(search || branch || category) && (
            <Button
              variant="outline"
              onClick={() => {
                setSearch("");
                setTerm("");
                setBranch("");
                setCategory("");
              }}
            >
              {m.clear}
            </Button>
          )}
        </div>
      ) : (
        <div className="fleet-table-wrap">
          <Table className="fleet-table">
            <TableCaption className="sr-only">{m.vehicles}</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{m.identity}</TableHead>
                <TableHead scope="col">{m.plate}</TableHead>
                <TableHead scope="col">{m.categoryId}</TableHead>
                <TableHead scope="col">{m.branchId}</TableHead>
                <TableHead scope="col">{m.publicVisible}</TableHead>
                <TableHead scope="col">{o.latestMileage}</TableHead>
                <TableHead scope="col">{o.readiness}</TableHead>
                <TableHead scope="col">
                  <span className="sr-only">{m.details}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="fleet-identity">
                    <span className="fleet-number">
                      <bdi>{r.fleetNumber}</bdi>
                    </span>
                    <Link href={`/app/${agencyId}/fleet/${r.id}`}>
                      <strong>
                        {r.make} {r.model}
                      </strong>
                      <small>
                        {r.year} · {m[r.transmission]} · {m[r.fuel]}
                      </small>
                    </Link>
                  </TableCell>
                  <TableCell data-label={m.plate}>
                    <bdi className="fleet-plate">{r.plate}</bdi>
                  </TableCell>
                  <TableCell data-label={m.categoryId}>
                    {localizedLabel(r.categoryLabels, locale)}
                  </TableCell>
                  <TableCell data-label={m.branchId}>{r.branchName}</TableCell>
                  <TableCell data-label={m.publicVisible}>
                    <span className="fleet-badge">
                      {r.publicVisible ? m.visible : m.hidden}
                    </span>
                  </TableCell>
                  <TableCell data-label={o.latestMileage}>
                    {r.mileageMeters === null
                      ? "—"
                      : `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(r.mileageMeters / 1000)} km`}
                  </TableCell>
                  <TableCell data-label={o.readiness}>
                    <span className={`fleet-readiness is-${r.readiness}`}>
                      {r.readiness === "ready" ? (
                        <CheckCircle2 className="size-4" aria-hidden />
                      ) : r.readiness === "blocked" ? (
                        <ShieldAlert className="size-4" aria-hidden />
                      ) : (
                        <AlertTriangle className="size-4" aria-hidden />
                      )}
                      {r.readiness === "ready"
                        ? o.ready
                        : r.readiness === "blocked"
                          ? o.blocked
                          : o.needsReview}
                    </span>
                  </TableCell>
                  <TableCell className="fleet-row-link">
                    <Link
                      href={`/app/${agencyId}/fleet/${r.id}`}
                      aria-label={`${m.details}: ${r.make} ${r.model}`}
                    >
                      <ArrowUpRight aria-hidden className="size-5" />
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {(status === "CanLoadMore" || status === "LoadingMore") && (
        <Button
          variant="outline"
          className="self-start min-h-11"
          disabled={status === "LoadingMore"}
          onClick={() => loadMore(20)}
        >
          {m.loadMore}
        </Button>
      )}
    </div>
  );
}
