import { Component, OnInit, OnDestroy, Input, OnChanges } from '@angular/core';
import { Build } from '../shared/build.model';
import { BuildsService } from '../shared/builds.service';
import { finalize } from 'rxjs/operators';
import { untilDestroyed, UntilDestroy } from '@ngneat/until-destroy';
import { SocketEvent } from '../../shared/models/socket.model';
import { Subscription } from 'rxjs';
import { DataService } from 'src/app/shared/providers/data.service';
import { BuildsOptions } from './builds-options.model';

@UntilDestroy()
@Component({
  selector: 'app-builds',
  templateUrl: './builds.component.html',
  styleUrls: ['./builds.component.sass']
})
export class BuildsComponent implements OnInit, OnChanges, OnDestroy {
  @Input() options: BuildsOptions = { type: 'latest' };

  builds: Build[] = [];
  fetchingBuilds: boolean = false;
  fetchingMore: boolean = false;
  hideMoreButton: boolean = false;
  limit = 5;
  offset = 0;
  error: string | null = null;
  sub: Subscription = new Subscription();

  constructor(private buildsService: BuildsService, private dataService: DataService) {}

  ngOnInit(): void {
    this.initDataEvents();
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
    this.dataService.unsubscribeAll();
  }

  ngOnChanges(): void {
    this.builds = [];
    this.limit = 5;
    this.offset = 0;
    this.error = null;
    this.find();
  }

  find(): void {
    if (this.offset === 0) {
      this.fetchingBuilds = true;
    } else {
      this.fetchingMore = true;
    }

    this.buildsService
      .find(this.limit, this.offset)
      .pipe(
        finalize(() => {
          this.fetchingBuilds = false;
          this.fetchingMore = false;
        }),
        untilDestroyed(this)
      )
      .subscribe(
        resp => {
          this.builds = this.builds.concat(resp);
          if (resp.length === this.limit) {
            this.offset += resp.length;
          } else {
            this.hideMoreButton = true;
          }
        },
        err => {
          this.error = err.message;
        }
      );
  }

  private initDataEvents(): void {
    this.sub
      .add(
        this.buildsService.buildsEvents().subscribe(build => {
          this.builds.unshift(build);
        })
      )
      .add(this.buildsService.jobEvents().subscribe(ev => this.updateJobFromEvent(ev)));

    this.buildsService.subscribeToBuildsEvents();
    this.buildsService.subscribeToJobEvents();
  }

  private updateJobFromEvent(ev: SocketEvent): void {
    if (!this.builds || !this.builds.length) {
      return;
    }

    const build = this.builds.find(b => b.id === ev.data.buildID);
    if (!build || !build.jobs || !build.jobs.length) {
      return;
    }

    const job = build.jobs.find(j => j.id === ev.data.jobID);
    if (!job) {
      return;
    }

    if (!job.endTime) {
      build.startTime = null;
      build.endTime = null;
    }

    job.startTime = ev.data.startTime ? new Date(ev.data.startTime) : null;
    job.endTime = ev.data.endTime ? new Date(ev.data.endTime) : null;
    job.status = ev.data.status;
  }
}
