{ config, lib, pkgs, readingroom, ... }:

let
  cfg = config.services.readingroom;
in
{
  options.services.readingroom = {
    enable = lib.mkEnableOption "ReadingRoom media server";

    package = lib.mkOption {
      type = lib.types.package;
      default = readingroom;
      description = "ReadingRoom package to use (defaults to the flake's combined package).";
    };

    host = lib.mkOption {
      type = lib.types.str;
      default = "127.0.0.1";
      description = "Listen address";
    };

    port = lib.mkOption {
      type = lib.types.port;
      default = 5299;
      description = "Listen port";
    };

    dataDir = lib.mkOption {
      type = lib.types.path;
      default = "/var/lib/readingroom";
      description = "Data directory for database and config";
    };

    libraryRoot = lib.mkOption {
      type = lib.types.nullOr lib.types.path;
      default = null;
      description = "Root directory for imported books";
    };

    auth = {
      enable = lib.mkEnableOption "JWT authentication" // {
        default = false;
      };
      jwtSecret = lib.mkOption {
        type = lib.types.nullOr lib.types.str;
        default = null;
        description = "JWT secret key (auto-generated if not set)";
      };
    };

    openFirewall = lib.mkOption {
      type = lib.types.bool;
      default = false;
      description = "Open the listening port in the firewall";
    };

    user = lib.mkOption {
      type = lib.types.str;
      default = "readingroom";
      description = "User account under which ReadingRoom runs";
    };

    group = lib.mkOption {
      type = lib.types.str;
      default = "readingroom";
      description = "Group account under which ReadingRoom runs";
    };
  };

  config = lib.mkIf cfg.enable {
    users.users = lib.optionalAttrs (cfg.user == "readingroom") {
      readingroom = {
        isSystemUser = true;
        group = cfg.group;
        home = cfg.dataDir;
        createHome = true;
      };
    };

    users.groups = lib.optionalAttrs (cfg.group == "readingroom") {
      readingroom = {};
    };

    networking.firewall = lib.mkIf cfg.openFirewall {
      allowedTCPPorts = [ cfg.port ];
    };

    systemd.services.readingroom = {
      description = "ReadingRoom media server";
      after = [ "network.target" ];
      wantedBy = [ "multi-user.target" ];

      serviceConfig = {
        Type = "simple";
        User = cfg.user;
        Group = cfg.group;
        WorkingDirectory = cfg.dataDir;
        ExecStart = lib.escapeShellArgs [
          "${cfg.package}/bin/readingroom-server"
          "--data-dir" cfg.dataDir
          "--host" cfg.host
          "--port" (toString cfg.port)
        ];
        Restart = "on-failure";
        RestartSec = "5s";

        # Hardening
        NoNewPrivileges = true;
        ProtectSystem = "strict";
        ProtectHome = true;
        PrivateTmp = true;
        PrivateDevices = true;
        ProtectKernelTunables = true;
        ProtectKernelModules = true;
        ProtectControlGroups = true;
        MemoryDenyWriteExecute = true;
        LockPersonality = true;
        RestrictRealtime = true;

        # Allow reads from library root if set
        ReadWritePaths = [
          cfg.dataDir
        ] ++ lib.optional (cfg.libraryRoot != null) cfg.libraryRoot;
      };

      environment = {
        READINGROOM_HOST = cfg.host;
        READINGROOM_PORT = toString cfg.port;
        # The combined package ships its web assets here; the server binary
        # needs FRONTEND_DIST to find them.
        FRONTEND_DIST = "${cfg.package}/share/readingroom";
      } // lib.optionalAttrs (cfg.auth.jwtSecret != null) {
        READINGROOM_JWT_SECRET = cfg.auth.jwtSecret;
      };
    };
  };
}
